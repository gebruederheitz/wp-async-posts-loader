# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

`@gebruederheitz/wp-async-posts-loader` is the browser-side companion to the PHP composer package `gebruederheitz/wp-async-posts-provider`. It exports a single class, `LoadMore` (`src/load-more.js`, re-exported from `index.js`), which wires a "load more" button to a WordPress REST endpoint and appends the returned posts to a container.

There is no build step: the package is published as untranspiled ES module source, and consumers bundle it themselves. The extensionless relative import in `index.js` relies on the consumer's bundler resolving it.

## Commands

The Node version is pinned in `.tool-versions`. `Taskfile.yaml` ([Task](https://taskfile.dev)) is the entry point; each task installs dependencies first when `package.json` or `package-lock.json` changed.

```shell
task test                       # lint + prettier check + test suite (alias: task lint)
task test:watch                 # vitest in watch mode
task release                    # cut a release, see below
npm run lint                    # eslint (flat config, eslint.config.mjs)
npm run prettier:check          # prettier check
npx eslint --fix .              # apply prettier formatting via the eslint plugin
npx vitest run -t 'removes the button'  # run a single test by name
```

Lint and prettier cover `index.js`, `vitest.config.mjs`, `src/` and `test/`.

## Tests

vitest with a jsdom environment (`vitest.config.mjs`); specs live in `test/` rather than next to the sources, because `src/` is published unbuilt. Tests import `describe`/`expect`/`vi` from `vitest` explicitly (no globals). Each test writes the button and container markup into the ambient `document` and stubs the global `fetch` with `vi.stubGlobal`, returning queued `{ posts, more }` bodies. Call `await loader.onClick()` to run a full load cycle without going through a DOM click. Failure paths are not covered yet; they come with the retry behaviour in #3.

## Releases

`task release` runs release-it (`.release-it.yaml`) on `main`, the only long-lived branch. It runs `task test`, bumps the version in `package.json` and `package-lock.json`, commits `[chore] Release vX.Y.Z`, tags, pushes, publishes to npm (requires `npm login`) and opens the GitHub release form in the browser. The release notes are built from the commits since the previous tag. What ends up in the npm package is controlled by `.npmignore`, so add new dev-only config files there.

npm's `latest` dist-tag currently points to `0.2.0-beta.1`, an untracked 2022 build experiment with the same `src/` as `0.1.0`. The next stable release should therefore be at least `0.2.0`, so that `latest` is also the highest published version.

## Architecture

### Server contract

`getMorePosts()` increments `currentPage` (starting from 1 on the first click) and fetches `getRequestPath(page)`, by default `/wp-json/${apiNamespace}/v${apiVersion}/${apiPath}?page=N` built from `getDefaultOptions()` (`ghwp`, `1`, `posts/load-more`). The response must be JSON `{ posts: string, more: boolean }`, where `posts` is an HTML fragment. Each top-level element of the fragment (parsed with `DOMParser`, taken from `body.children`) becomes one appended post. This matches the `ghwp/v1` namespace the PHP provider registers through `gebruederheitz/wp-simple-rest`.

### Click flow and events

`onClick` adds the `.busy` class to the button, emits `load:start`, awaits `getMorePosts()`, removes the button and emits `posts:end` when `more` is falsy, then emits `load:finish`. `parseAndAppendPosts` emits `posts:parsed`, `appendPosts` emits `post:append` per element, and it is `parseAndAppendPosts` (not `onClick`) that removes `.busy`. Events go through an internal [mitt](https://github.com/developit/mitt) emitter; `on()` returns a function that removes the listener (a no-op when the button is missing). The event names and payloads are documented in the README's events table and form the public API.

Failure behaviour: a fetch or JSON error is swallowed by `.catch(console.warn)`, so `getMorePosts()` resolves to `undefined` and the button is removed as if there were no more posts.

### Missing button

If `buttonSelector` matches nothing, the constructor returns early without creating `container`, `eventProxy` or the listener. `on()`, `onClick()` and `removeButton()` guard against this, so any new public method must do the same.

### Extension by subclassing

Consumers customise behaviour by extending `LoadMore` and overriding methods (see the README's "Extending functionality" section). The methods the README tells them to override — `initFilters()` (an empty hook called from the constructor before `listen()`) and `getRequestPath()` — plus the documented `onClick()`, `removeButton()` and `on()` are effectively public API; changing their names, signatures or call order is a breaking change. `parseOptions()` shallow-merges user options over `getDefaultOptions()` and skips options set to `undefined`, so they keep their default.
