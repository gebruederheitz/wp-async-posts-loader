import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { LoadMore } from '../src/load-more.js';

/**
 * The loader reads its button and container from the ambient jsdom document
 * and requests posts through the global fetch(), which each test stubs with a
 * queue of server responses.
 */

const markup = `
    <div class="ghwp-latest-posts"><article id="initial"></article></div>
    <div class="ghwp-load-more"><button type="button">Load more</button></div>
`;

/**
 * @param {...({posts: string, more: boolean}|function(): Response)} responses
 *        One per request: either a body in the shape the PHP provider
 *        returns, sent with HTTP 200, or a function producing the fetch()
 *        result (see `failures`).
 */
function stubServer(...responses) {
    const fetchMock = vi.fn(async () => {
        const response = responses.shift();
        return typeof response === 'function'
            ? response()
            : Response.json(response);
    });
    vi.stubGlobal('fetch', fetchMock);
    return fetchMock;
}

const failures = {
    'the network request fails': () => {
        throw new TypeError('Failed to fetch');
    },
    'the server responds with an HTTP error': () =>
        Response.json(
            {
                code: 'rest_no_route',
                message: 'No route',
                data: { status: 404 },
            },
            { status: 404 }
        ),
    'the response is not JSON': () => new Response('<b>Fatal error</b>'),
    'the response contains no rendered posts': () =>
        Response.json({ posts: [], more: true }),
};

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
    it('does nothing when the button is missing', async () => {
        document.body.innerHTML = '';
        const fetchMock = stubServer();

        const loader = new LoadMore();

        loader.on('load:start', () => {})();
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

    it('keeps the default for options set to undefined', async () => {
        const fetchMock = stubServer({ posts: '', more: true });
        const loader = new LoadMore({
            buttonSelector: undefined,
            apiNamespace: undefined,
        });

        await loader.onClick();

        expect(loader.button).toBe(button());
        expect(fetchMock).toHaveBeenCalledWith(
            '/wp-json/ghwp/v1/posts/load-more?page=1'
        );
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

    it('stops calling a listener once it is removed', async () => {
        stubServer(
            { posts: '<article id="a"></article>', more: true },
            { posts: '<article id="b"></article>', more: true }
        );
        const loader = new LoadMore();
        const onStart = vi.fn();
        const removeListener = loader.on('load:start', onStart);

        await loader.onClick();
        removeListener();
        await loader.onClick();

        expect(onStart).toHaveBeenCalledTimes(1);
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

    it('ignores clicks while a page is loading', async () => {
        let respond;
        const fetchMock = stubServer(
            () => new Promise((resolve) => (respond = resolve))
        );
        const loader = new LoadMore();

        const firstClick = loader.onClick();
        await loader.onClick();
        respond(
            Response.json({ posts: '<article id="a"></article>', more: true })
        );
        await firstClick;

        expect(fetchMock).toHaveBeenCalledTimes(1);
        expect(postIds()).toEqual(['initial', 'a']);
    });
});

describe('LoadMore when loading fails', () => {
    const errorMessage = () => document.querySelector('.ghwp-load-more__error');
    let warn;

    beforeEach(() => {
        warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    });

    afterEach(() => {
        vi.restoreAllMocks();
    });

    function recordEvents(loader) {
        const events = [];
        for (const name of [
            'load:start',
            'load:error',
            'posts:end',
            'load:finish',
        ]) {
            loader.on(name, (payload) => events.push([name, payload]));
        }
        return events;
    }

    it.each(Object.keys(failures))(
        'offers a retry when %s',
        async (failure) => {
            stubServer(failures[failure]);
            const loader = new LoadMore();
            const events = recordEvents(loader);

            await loader.onClick();

            expect(button().textContent).toBe('↻ Retry');
            expect(button().classList.contains('retry')).toBe(true);
            expect(button().classList.contains('busy')).toBe(false);
            expect(errorMessage().textContent).toBe(
                'Loading more posts failed.'
            );
            expect(errorMessage().getAttribute('role')).toBe('alert');
            expect(errorMessage().nextElementSibling).toBe(button());
            expect(postIds()).toEqual(['initial']);
            expect(events).toEqual([
                ['load:start', undefined],
                ['load:error', { error: expect.any(Error) }],
                ['load:finish', undefined],
            ]);
            expect(warn).toHaveBeenCalledWith(events[1][1].error);
        }
    );

    it('reports the HTTP status of a failed request', async () => {
        stubServer(failures['the server responds with an HTTP error']);
        const loader = new LoadMore();
        const onError = vi.fn();
        loader.on('load:error', onError);

        await loader.onClick();

        expect(onError.mock.calls[0][0].error.message).toBe(
            'Loading page 1 failed with HTTP 404.'
        );
    });

    it('requests the failed page again and restores the button', async () => {
        button().innerHTML = '<span class="icon"></span> Load more';
        const fetchMock = stubServer(failures['the network request fails'], {
            posts: '<article id="a"></article>',
            more: true,
        });
        const loader = new LoadMore();

        await loader.onClick();
        await loader.onClick();

        expect(fetchMock.mock.calls.map(([path]) => path)).toEqual([
            '/wp-json/ghwp/v1/posts/load-more?page=1',
            '/wp-json/ghwp/v1/posts/load-more?page=1',
        ]);
        expect(postIds()).toEqual(['initial', 'a']);
        expect(button().innerHTML).toBe('<span class="icon"></span> Load more');
        expect(button().classList.contains('retry')).toBe(false);
        expect(errorMessage()).toBeNull();
    });

    it('replaces the message on every failure', async () => {
        stubServer(
            failures['the network request fails'],
            failures['the network request fails'],
            { posts: '<article id="a"></article>', more: true }
        );
        const loader = new LoadMore();

        await loader.onClick();
        const firstMessage = errorMessage();
        await loader.onClick();

        expect(
            document.querySelectorAll('.ghwp-load-more__error')
        ).toHaveLength(1);
        expect(errorMessage()).not.toBe(firstMessage);

        await loader.onClick();

        expect(button().textContent).toBe('Load more');
    });

    it('removes the button when the retried page is the last one', async () => {
        stubServer(failures['the network request fails'], {
            posts: '<article id="a"></article>',
            more: false,
        });
        const loader = new LoadMore();

        await loader.onClick();
        await loader.onClick();

        expect(button()).toBeNull();
        expect(errorMessage()).toBeNull();
    });

    it('simulates a failure while the button has data-ghwp-simulate-error', async () => {
        button().setAttribute('data-ghwp-simulate-error', '');
        const fetchMock = stubServer({
            posts: '<article id="a"></article>',
            more: true,
        });
        const loader = new LoadMore();
        const onError = vi.fn();
        loader.on('load:error', onError);

        await loader.onClick();

        expect(fetchMock).not.toHaveBeenCalled();
        expect(button().textContent).toBe('↻ Retry');
        expect(onError.mock.calls[0][0].error.message).toBe(
            'Loading page 1 failed (simulated by data-ghwp-simulate-error).'
        );

        button().removeAttribute('data-ghwp-simulate-error');
        await loader.onClick();

        expect(fetchMock).toHaveBeenCalledWith(
            '/wp-json/ghwp/v1/posts/load-more?page=1'
        );
        expect(button().textContent).toBe('Load more');
        expect(postIds()).toEqual(['initial', 'a']);
    });

    it('uses the configured texts', async () => {
        stubServer(failures['the network request fails']);
        const loader = new LoadMore({
            errorMessage: 'Laden fehlgeschlagen.',
            retryLabel: 'Erneut versuchen',
        });

        await loader.onClick();

        expect(errorMessage().textContent).toBe('Laden fehlgeschlagen.');
        expect(button().textContent).toBe('Erneut versuchen');
    });

    it('lets subclasses present errors differently', async () => {
        stubServer(failures['the network request fails'], {
            posts: '',
            more: true,
        });
        const shown = [];

        class ToastLoader extends LoadMore {
            showError(error) {
                shown.push(error.message);
            }

            clearError() {
                shown.push('cleared');
            }
        }
        const loader = new ToastLoader();
        await loader.onClick();
        await loader.onClick();

        expect(shown).toEqual(['Failed to fetch', 'cleared']);
        expect(errorMessage()).toBeNull();
        expect(button().textContent).toBe('Load more');
    });
});
