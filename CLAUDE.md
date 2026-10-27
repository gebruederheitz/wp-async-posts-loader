# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

`@gebruederheitz/wp-async-posts-loader` is the browser-side companion to the PHP composer package `gebruederheitz/wp-async-posts-provider`. It exports a single class, `LoadMore` (`src/load-more.js`, re-exported from `index.js`), which wires a "load more" button to a WordPress REST endpoint and appends the returned posts to a container.

There is no build step and no test suite: the package is published as untranspiled ES module source, and consumers bundle it themselves. The extensionless relative import in `index.js` relies on the consumer's bundler resolving it.

## Commands

The Node version is pinned in `.tool-versions`.

```shell
npm run lint                    # eslint (flat config, eslint.config.mjs) over index.js and ./src
npm run prettier:check          # prettier check over index.js and ./src/**/*.js
npx eslint --fix index.js ./src # apply prettier formatting via the eslint plugin
```

## Architecture

### Server contract

`getMorePosts()` increments `currentPage` (starting from 1 on the first click) and fetches `getRequestPath(page)`, by default `/wp-json/${apiNamespace}/v${apiVersion}/${apiPath}?page=N` built from `getDefaultOptions()` (`ghwp`, `1`, `posts/load-more`). The response must be JSON `{ posts: string, more: boolean }`, where `posts` is an HTML fragment. Each top-level element of the fragment (parsed with `DOMParser`, taken from `body.children`) becomes one appended post. The README still names the namespace `ghwapp`, but the code default is `ghwp`.

### Click flow and events

`onClick` adds the `.busy` class to the button, emits `load:start`, awaits `getMorePosts()`, removes the button and emits `posts:end` when `more` is falsy, then emits `load:finish`. `parseAndAppendPosts` emits `posts:parsed`, `appendPosts` emits `post:append` per element, and it is `parseAndAppendPosts` (not `onClick`) that removes `.busy`. Events go through an internal `EventEmitter2` exposed via `on()`. The event names and payloads are documented in the README's events table and form the public API.

Failure behaviour: a fetch or JSON error is swallowed by `.catch(console.warn)`, so `getMorePosts()` resolves to `undefined` and the button is removed as if there were no more posts.

### Missing button

If `buttonSelector` matches nothing, the constructor returns early without creating `container`, `eventProxy` or the listener. `on()`, `onClick()` and `removeButton()` guard against this, so any new public method must do the same.

### Extension by subclassing

Consumers customise behaviour by extending `LoadMore` and overriding methods (see the README's "Extending functionality" section). The methods the README tells them to override — `initFilters()` (an empty hook called from the constructor before `listen()`) and `getRequestPath()` — plus the documented `onClick()`, `removeButton()` and `on()` are effectively public API; changing their names, signatures or call order is a breaking change. User options are deep-merged over `getDefaultOptions()` with lodash `merge`.
