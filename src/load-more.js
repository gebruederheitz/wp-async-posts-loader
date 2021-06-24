import _merge from 'lodash-es/merge';
import { EventEmitter2 } from 'eventemitter2';

export class LoadMore {
    /**
     * @param {object} userOptions
     * @param {?string} userOptions.buttonSelector     The button triggering the
     *                                                 loading operations.
     * @param {?string} userOptions.containerSelector  The container that the
     *                                                 retrieved posts will be
     *                                                 appended to.
     */
    constructor(userOptions = {}) {
        this.options = this.parseOptions(userOptions);
        this.button = document.querySelector(this.options.buttonSelector);
        if (!this.button) return;

        this.currentPage = 0;

        this.parser = new DOMParser();
        this.container = document.querySelector(this.options.containerSelector);
        this.eventProxy = new EventEmitter2();

        this.onClick = this.onClick.bind(this);

        this.initFilters();
        this.listen();
    }

    /**
     * Appends $posts to the container.
     *
     * @emits post:append
     * @param {Element[]} posts
     */
    appendPosts(posts) {
        posts.forEach((post) => {
            this.container.appendChild(post);
            this.eventProxy.emit('post:append', { post });
        });
    }

    /**
     * Attach an event listener.
     *
     * @param args
     * @return {EventEmitter2 | Listener}
     */
    on(...args) {
        if (this.eventProxy && this.eventProxy.on) {
            return this.eventProxy.on(...args);
        }
    }

    getDefaultOptions() {
        return {
            buttonSelector: '.ghwp-load-more button',
            containerSelector: '.ghwp-latest-posts',
        };
    }

    /**
     * Returns the request path for the current page & filters
     *
     * @param {number} page
     * @return {string}
     */
    getRequestPath(page = 0) {
        return `/wp-json/ghwapp/v1/posts/load-more?page=${page}`;
    }

    /**
     * Retrieve the next page of posts from the server.
     *
     * @return {Promise<boolean>}  Whether or not there are any posts left to be
     *                             loaded.
     */
    getMorePosts() {
        ++this.currentPage;

        const path = this.getRequestPath(this.currentPage);

        return fetch(path)
            .then((res) => res.json())
            .then(({ posts, more }) => {
                this.parseAndAppendPosts(posts);
                return more;
            })
            .catch(console.warn);
    }

    /**
     * "Abstract" method to allow for insertion of custom filtering. You may
     * introduce / pre-configure / initialise your filters in this method and
     * the use them by extending getRequestPath().
     */
    initFilters() {}

    /**
     * Set up the required event listeners.
     */
    listen() {
        this.button.addEventListener('click', this.onClick);
    }

    /**
     * Click event handler for the load more button.
     *
     * @emits posts:end
     * @return {Promise<void>}
     */
    async onClick() {
        if (!this.button) return;

        this.button.classList.add('busy');
        this.eventProxy.emit('load:start');
        if (!(await this.getMorePosts())) {
            this.removeButton();
            this.eventProxy.emit('posts:end');
        }
        this.eventProxy.emit('load:finish');
    }

    /**
     * Parses the received document into the post elements and calls
     * appendPosts().
     *
     * @emits posts:parsed
     * @param {string} rawString  The raw HTML string received from the server.
     */
    parseAndAppendPosts(rawString = '') {
        const document = this.parseHtmlResponse(rawString);
        const postsCollection = document.body.children;
        const posts = Array.from(postsCollection);
        this.eventProxy.emit('posts:parsed', { posts });
        this.appendPosts(posts);
        this.button.classList.remove('busy');
        this.button.blur();
    }

    /**
     * Uses the DOMParser to parse the HTML string into a document object.
     *
     * @param {string} string The raw HTML document string
     * @return {Document} The parsed HTML document object
     */
    parseHtmlResponse(string) {
        return this.parser.parseFromString(string, 'text/html');
    }

    /**
     * Applies user-set options (passed through the constructor) to the default
     * settings.
     *
     * @param {object} userOptions
     * @return {object}
     */
    parseOptions(userOptions) {
        return _merge(this.getDefaultOptions(), userOptions);
    }

    /**
     * Removes the button from the DOM once all available posts have been
     * loaded.
     */
    removeButton() {
        this.button && this.button.remove();
    }
}
