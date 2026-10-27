import mitt from 'mitt';

export class LoadMore {
    /**
     * @param {object} userOptions
     * @param {?string} userOptions.buttonSelector     The button triggering the
     *                                                 loading operations.
     * @param {?string} userOptions.containerSelector  The container that the
     *                                                 retrieved posts will be
     *                                                 appended to.
     * @param {?string} userOptions.errorMessage       Shown when loading fails.
     * @param {?string} userOptions.retryLabel         Replaces the button's
     *                                                 content after a failure.
     */
    constructor(userOptions = {}) {
        this.options = this.parseOptions(userOptions);
        this.button = document.querySelector(this.options.buttonSelector);
        if (!this.button) return;

        this.currentPage = 0;
        this.loading = false;
        this.errorElement = null;
        this.originalButtonContent = null;

        this.parser = new DOMParser();
        this.container = document.querySelector(this.options.containerSelector);
        this.eventProxy = mitt();

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
     * Removes the error message and restores the button's original content
     * after a failed load has been retried successfully.
     */
    clearError() {
        if (this.errorElement) {
            this.errorElement.remove();
            this.errorElement = null;
        }
        if (this.originalButtonContent !== null) {
            this.button.innerHTML = this.originalButtonContent;
            this.originalButtonContent = null;
        }
        this.button.classList.remove('retry');
    }

    /**
     * Attach an event listener.
     *
     * @param {string} type
     * @param {function(*): void} handler  Receives the event's payload.
     * @return {function(): void}  Removes the listener again.
     */
    on(type, handler) {
        if (!this.eventProxy) return () => {};

        this.eventProxy.on(type, handler);
        return () => this.eventProxy.off(type, handler);
    }

    getDefaultOptions() {
        return {
            buttonSelector: '.ghwp-load-more button',
            containerSelector: '.ghwp-latest-posts',
            apiNamespace: 'ghwp',
            apiVersion: '1',
            apiPath: 'posts/load-more',
            errorMessage: 'Loading more posts failed.',
            retryLabel: '↻ Retry',
        };
    }

    /**
     * Returns the request path for the current page & filters
     *
     * @param {number} page
     * @return {string}
     */
    getRequestPath(page = 0) {
        return `/wp-json/${this.options.apiNamespace}/v${this.options.apiVersion}/${this.options.apiPath}?page=${page}`;
    }

    /**
     * Retrieve the next page of posts from the server. The page only counts as
     * loaded once the server has returned it, so a page that failed is
     * requested again on the next call.
     *
     * @return {Promise<boolean>}  Whether or not there are any posts left to be
     *                             loaded.
     * @throws {Error}  When the request fails or the response isn't a page of
     *                  rendered posts.
     */
    async getMorePosts() {
        const page = this.currentPage + 1;
        const res = await fetch(this.getRequestPath(page));
        if (!res.ok) {
            throw new Error(
                `Loading page ${page} failed with HTTP ${res.status}.`
            );
        }

        const body = await res.json();
        if (!body || typeof body.posts !== 'string') {
            throw new Error(`The response for page ${page} contains no posts.`);
        }

        this.currentPage = page;
        this.parseAndAppendPosts(body.posts);
        return body.more;
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
     * Click event handler for the load more button. Clicks while a page is
     * still loading are ignored.
     *
     * @emits load:start
     * @emits posts:end
     * @emits load:error
     * @emits load:finish
     * @return {Promise<void>}
     */
    async onClick() {
        if (!this.button || this.loading) return;

        this.loading = true;
        this.button.classList.add('busy');
        this.eventProxy.emit('load:start');
        try {
            const more = await this.getMorePosts();
            this.clearError();
            if (!more) {
                this.removeButton();
                this.eventProxy.emit('posts:end');
            }
        } catch (error) {
            this.showError(error);
            this.eventProxy.emit('load:error', { error });
        } finally {
            this.loading = false;
            this.button.classList.remove('busy');
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
     * settings. Options set to undefined keep their default value.
     *
     * @param {object} userOptions
     * @return {object}
     */
    parseOptions(userOptions) {
        const options = this.getDefaultOptions();
        for (const [key, value] of Object.entries(userOptions)) {
            if (value !== undefined) options[key] = value;
        }
        return options;
    }

    /**
     * Removes the button from the DOM once all available posts have been
     * loaded.
     */
    removeButton() {
        this.button && this.button.remove();
    }

    /**
     * Logs the error, tells the user that loading failed and turns the button
     * into a retry button until the next successful load. Override this and
     * clearError() to present errors differently.
     *
     * @param {Error} error
     */
    showError(error) {
        console.warn(error);

        // Replace rather than update the message, so that screen readers
        // announce it again on every failure.
        if (this.errorElement) this.errorElement.remove();
        this.errorElement = document.createElement('p');
        this.errorElement.className = 'ghwp-load-more__error';
        this.errorElement.setAttribute('role', 'alert');
        this.errorElement.textContent = this.options.errorMessage;
        this.button.parentNode.insertBefore(this.errorElement, this.button);

        if (this.originalButtonContent === null) {
            this.originalButtonContent = this.button.innerHTML;
        }
        this.button.textContent = this.options.retryLabel;
        this.button.classList.add('retry');
    }
}
