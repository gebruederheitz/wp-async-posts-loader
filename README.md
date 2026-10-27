# Wordpress Async Posts Loader

The front-end script to work with the `gebruederheitz/wp-async-posts-provider` ( https://github.com/gebruederheitz/ghwapp )
PHP composer package.

## Installation

```shell
> npm i @gebruederheitz/wp-async-posts-loader
```

### Requirements

The package is an untranspiled ES module (ES2017) meant to be imported by your
bundler. It runs in all current browsers without polyfills; it relies on
`fetch`, `DOMParser` and `Element.remove()`. If you target older browsers, make
sure your bundler transpiles it (many configurations exclude `node_modules`
from transpilation) and polyfill `fetch`.


## Usage

### Basic Usage

```js
import {LoadMore} from '@gebruederheitz/wp-async-posts-loader';

new LoadMore();
```

This will attach the listener to a button matching `.ghwp-load-more button` and
a container `.ghwp-latest-posts`. Clicking the button will make an asynchronous
REST request to `/wp-json/ghwp/v1/posts/load-more?page=${page}`, where the PHP
Posts Provider resides. The rendered posts thus retrieved will be appended to
the container.
The number of posts can be specified through the Provider's configuration
server-side.

### Available options

You may customize the button & container used and the texts shown when loading
fails by providing options to the constructor:
```js
new LoadMore({
    buttonSelector: 'a.load-more-button[href="#"]',
    containerSelector: 'section#posts',
    errorMessage: 'Weitere Beiträge konnten nicht geladen werden.', // default: 'Loading more posts failed.'
    retryLabel: '↻ Erneut versuchen',                               // default: '↻ Retry'
});
```

### When loading fails

If a page can't be loaded (network error, HTTP error status, or a response
without rendered posts), the button stays in place and turns into a retry
button: its content is replaced by `retryLabel` and it receives a `.retry`
class. An error message (`errorMessage`) is inserted right before the button as
`<p class="ghwp-load-more__error" role="alert">`, so screen readers announce it.
Clicking the button requests the same page again. Once that succeeds, the
message is removed and the button gets its original content back.

Clicks on the button while a page is still loading are ignored.

### API

Some methods you may find useful:


```js
const loader = new LoadMore();
loader.removeButton();  // when you've had enough – this will be called
                        // automatically when there are no more posts left to be
                        // loaded
loader.onClick();       // Allows you to programmatically trigger loading more
                        // elements. Do not use getMorePosts() unless you know
                        // know what you're doing!
const off = loader.on('event:name', callback); // Attach an event listener;
                                                // call off() to remove it
```

#### Events

| Event        | Parameters            | Description                                                             |
| ------------ | --------------------- | ----------------------------------------------------------------------- |
| post:append  | `{post: Element}`     | A post has been appended to the container.                              |
| posts:end    | n/a                   | All posts have been retrieved, the button will now be removed.          |
| posts:parsed | `{posts: Element[]}`  | The posts have been retrieved and parsed into an array of DOM elements. |
| load:start   | n/a                   | Loading has been requested.                                             |
| load:error   | `{error: Error}`      | Loading a page failed; the button now offers a retry.                   |
| load:finish  | n/a                   | All processing has finished, whether loading succeeded or failed.       |


#### Additional classnames

During the loading process, the button element will receive a `.busy` class,
which you can use to give visual feedback to the user. After a failed load, it
has the `.retry` class until the next successful load; the error message has
the class `.ghwp-load-more__error`.


### Extending functionality

You can easily extend the module's functionality by building on top of the class.
Here are some examples:

#### Presenting errors differently

Override `showError(error)` and `clearError()` to replace the default error
message and retry button, for example with a toast notification. `showError()`
is called with the error after every failed load, `clearError()` after every
successful one.

```js
class MyLoader extends LoadMore {
    showError(error) {
        console.warn(error);
        myToasts.show(this.options.errorMessage);
    }

    clearError() {
        myToasts.hide();
    }
}
```

#### Additional parameters

```js
import { LoadMore } from '@gebruederheitz/wp-async-posts-loader';

class MyLoader extends LoadMore {

    /*
     *  Use the initFilters() stub to initialize your filter properties, for
     *  example by reading them from the button's data attributes:
     *
     * <div class="ghwp-load-more">
     *     <button type="button" data-ghwp-category="42" >Load more</button>
     * </div>
     *
     */
    initFilters() {
        this.category = 0;
        this.tag = 0;

        if (this.button.dataset) {
            /* category will be 42 */
            this.category = this.button.dataset.ghwpCategory || 0;
            /* tag will not be set */
            this.tag = this.button.dataset.ghwpTag || 0;
        }
    }

    /*
     *  Override / extend the getRequestPath() method to apply the filters to
     *  the URL's query:
     */
    getRequestPath(page = 0) {
        let path = super.getRequestPath(page);

        if (this.category) {
            path += `&category=${this.category}`;
        }
        if (this.tag) {
            path += `&tag=${this.tag}`;
        }

        return path;
    }
}
```


## Upgrading

### From 0.x to 1.0

#### `on()` returns a function that removes the listener

Events are now handled by [mitt](https://github.com/developit/mitt) instead of
EventEmitter2. Listeners still receive the same payloads, but `on()` no longer
returns the event emitter. It returns a function that removes the listener
again:

```js
// 0.x
loader.on('load:start', onStart).on('load:finish', onFinish);

// 1.0
const offStart = loader.on('load:start', onStart);
const offFinish = loader.on('load:finish', onFinish);
// later:
offStart();
```

This means:

- Calls to `on()` can no longer be chained.
- The other EventEmitter2 methods (`off()`, `once()`, `onAny()`,
  `removeAllListeners()` etc.) and `on()`'s third `options` argument are no
  longer available. To listen only once, call the returned function inside the
  listener.
- If the button can't be found, `on()` returns a function that does nothing,
  rather than `undefined`.

#### Failed loads no longer remove the button

In 0.x, a failed request was only logged to the console and treated like the
last page: the button was removed and `posts:end` was emitted. Now the button
turns into a retry button, `load:error` is emitted instead of `posts:end`, and
the failed page is requested again on the next click (see
[When loading fails](#when-loading-fails)). If you listened to `posts:end` to
handle errors, listen to `load:error` instead.

Clicks while a page is loading are now ignored; in 0.x, each click started a
request for the next page right away.

`getMorePosts()` now rejects when loading fails instead of resolving with
`undefined`. The `.busy` class is now removed by `onClick()`, after the posts
have been appended, rather than by `parseAndAppendPosts()`.

#### Import from the package name only

The package now declares its entry point in `exports`, so deep imports such as
`@gebruederheitz/wp-async-posts-loader/src/load-more` fail. Import `LoadMore`
from `@gebruederheitz/wp-async-posts-loader` instead.

#### Options are merged shallowly

User options used to be deep-merged with the defaults. They now replace them key
by key. This only makes a difference if a subclass's `getDefaultOptions()`
returns nested objects. Options set to `undefined` still keep their default.
