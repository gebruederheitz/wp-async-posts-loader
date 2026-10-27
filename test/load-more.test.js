import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { LoadMore } from '../src/load-more';

/**
 * The loader reads its button and container from the ambient jsdom document
 * and requests posts through the global fetch(), which each test stubs with a
 * queue of server responses in the shape the PHP provider returns:
 * `{ posts: string, more: boolean }`.
 */

const markup = `
    <div class="ghwp-latest-posts"><article id="initial"></article></div>
    <div class="ghwp-load-more"><button type="button">Load more</button></div>
`;

/**
 * @param {...{posts: string, more: boolean}} responses  One per request.
 */
function stubServer(...responses) {
    const fetchMock = vi.fn(async () => {
        const body = responses.shift();
        return { json: async () => body };
    });
    vi.stubGlobal('fetch', fetchMock);
    return fetchMock;
}

const button = () => document.querySelector('.ghwp-load-more button');
const container = () => document.querySelector('.ghwp-latest-posts');
const postIds = () => Array.from(container().children, (post) => post.id);

beforeEach(() => {
    document.body.innerHTML = markup;
});

afterEach(() => {
    vi.unstubAllGlobals();
    document.body.innerHTML = '';
});

describe('LoadMore', () => {
    it('is exported from the package entry point', async () => {
        const entry = await import('../index');

        expect(entry.LoadMore).toBe(LoadMore);
    });

    it('does nothing when the button is missing', async () => {
        document.body.innerHTML = '';
        const fetchMock = stubServer();

        const loader = new LoadMore();

        expect(loader.on('load:start', () => {})).toBeUndefined();
        await loader.onClick();
        loader.removeButton();
        expect(fetchMock).not.toHaveBeenCalled();
    });

    it('loads the next page when the button is clicked', async () => {
        const fetchMock = stubServer(
            { posts: '<article id="a"></article>', more: true },
            { posts: '<article id="b"></article>', more: true }
        );
        new LoadMore();

        button().click();
        await vi.waitFor(() => expect(postIds()).toContain('a'));
        button().click();
        await vi.waitFor(() => expect(postIds()).toContain('b'));

        expect(fetchMock.mock.calls.map(([path]) => path)).toEqual([
            '/wp-json/ghwp/v1/posts/load-more?page=1',
            '/wp-json/ghwp/v1/posts/load-more?page=2',
        ]);
    });

    it('appends every top-level element of the response in order', async () => {
        stubServer({
            posts: '<article id="a"><p>Nested</p></article><article id="b"></article>',
            more: true,
        });
        const loader = new LoadMore();

        await loader.onClick();

        expect(postIds()).toEqual(['initial', 'a', 'b']);
    });

    it('merges user options over the defaults', async () => {
        document.body.innerHTML = `
            <section id="posts"></section>
            <a class="load-more-button" href="#">Load more</a>
        `;
        const fetchMock = stubServer({
            posts: '<article id="a"></article>',
            more: true,
        });
        const loader = new LoadMore({
            buttonSelector: 'a.load-more-button',
            containerSelector: 'section#posts',
            apiNamespace: 'custom',
        });

        await loader.onClick();

        expect(fetchMock).toHaveBeenCalledWith(
            '/wp-json/custom/v1/posts/load-more?page=1'
        );
        expect(document.querySelector('#posts #a')).not.toBeNull();
    });

    it('emits its events in order', async () => {
        stubServer({
            posts: '<article id="a"></article><article id="b"></article>',
            more: false,
        });
        const loader = new LoadMore();
        const events = [];
        for (const name of [
            'load:start',
            'posts:parsed',
            'post:append',
            'posts:end',
            'load:finish',
        ]) {
            loader.on(name, (payload) => events.push([name, payload]));
        }

        await loader.onClick();

        const [a, b] = container().querySelectorAll('#a, #b');
        expect(events).toEqual([
            ['load:start', undefined],
            ['posts:parsed', { posts: [a, b] }],
            ['post:append', { post: a }],
            ['post:append', { post: b }],
            ['posts:end', undefined],
            ['load:finish', undefined],
        ]);
    });

    it('marks the button as busy while loading', async () => {
        stubServer({ posts: '<article id="a"></article>', more: true });
        const loader = new LoadMore();
        let busyOnStart;
        loader.on('load:start', () => {
            busyOnStart = button().classList.contains('busy');
        });

        await loader.onClick();

        expect(busyOnStart).toBe(true);
        expect(button().classList.contains('busy')).toBe(false);
    });

    it('keeps the button while there are more posts', async () => {
        stubServer({ posts: '<article id="a"></article>', more: true });
        const loader = new LoadMore();
        const onEnd = vi.fn();
        loader.on('posts:end', onEnd);

        await loader.onClick();

        expect(button()).not.toBeNull();
        expect(onEnd).not.toHaveBeenCalled();
    });

    it('removes the button once the last page is loaded', async () => {
        stubServer({ posts: '<article id="a"></article>', more: false });
        const loader = new LoadMore();

        await loader.onClick();

        expect(button()).toBeNull();
        expect(postIds()).toContain('a');
    });

    it('lets subclasses add filters to the request', async () => {
        document.body.innerHTML = markup.replace(
            '<button',
            '<button data-ghwp-category="42"'
        );
        const fetchMock = stubServer({ posts: '', more: true });

        class FilteredLoader extends LoadMore {
            initFilters() {
                this.category = this.button.dataset.ghwpCategory;
            }

            getRequestPath(page = 0) {
                return `${super.getRequestPath(page)}&category=${this.category}`;
            }
        }
        await new FilteredLoader().onClick();

        expect(fetchMock).toHaveBeenCalledWith(
            '/wp-json/ghwp/v1/posts/load-more?page=1&category=42'
        );
    });
});
