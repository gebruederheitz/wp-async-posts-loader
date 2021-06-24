# Wordpress Async Posts Loader

The front-end script to work with the `gebruederheitz/wp-async-post-provider`
PHP composer package.

## Installation

```shell
> npm i @gebruederheitz/wp-async-posts-loader
```


## Usage

### Basic Usage

```js
import {LoadMore} from '@gebruederheitz/wp-async-posts-loader';

new LoadMore();
```

This will attach the listener to a button matching `.ghwp-load-more button` and
a container `.ghwp-latest-posts`. Clicking the button will make an asynchronous
REST request to `/wp-json/ghwapp/v1/posts/load-more?page=${page}`, where the PHP
Posts Provider resides. The rendered posts thus retrieved will be appended to
the container.
The number of posts can be specified through the Provider's configuration
server-side.

### Available options

You may customize the button & container used by providing options to the
constructor:
```js
new LoadMore({
    buttonSelector: 'a.load-more-button[href="#"]',
    containerSelector: 'section#posts',
});
```

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
loader.on('event:name', callback) // Attach an event listener
```

#### Events

| Event        | Parameters            | Description                                                             |
| ------------ | --------------------- | ----------------------------------------------------------------------- |
| post:append  | `{post: Element}`     | A post has been appended to the container.                              |
| posts:end    | n/a                   | All posts have been retrieved, the button will now be removed.          |
| posts:parsed | `{posts: Element[]}`  | The posts have been retrieved and parsed into an array of DOM elements. |
| load:start   | n/a                   | Loading has been requested.                                             |
| load:finish  | n/a                   | All processing has finished.                                            |


#### Additional classnames

During the loading process, the button element will receive a `.busy` class,
which you can use to give visual feedback to the user.


### Extending functionality

You can easily extend the module's functionality by building on top of the class.
Here are some examples:

#### Additional parameters

```js
import {LoadMore} from './load-more';

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
