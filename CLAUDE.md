# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

`@gebruederheitz/wp-async-posts-loader` is the browser-side companion to the PHP composer package `gebruederheitz/wp-async-posts-provider`. It exports a single class, `LoadMore` from `src/load-more.js`, which is also the package entry point (`exports`/`main` in `package.json`), which wires a "load more" button to a WordPress REST endpoint and appends the returned posts to a container.

There is no build step: the package is published as untranspiled ES module source, and consumers bundle it themselves. It must also import under strict Node ESM: keep `.js` extensions on relative imports and only use dependencies that ship real ESM. `test/package.test.js` checks this in a plain Node process, because vitest resolves through Vite, which tolerates both mistakes. The README's "Requirements" section lists the browser APIs it relies on; update it when adding one.

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

Lint and prettier cover `vitest.config.mjs`, `src/` and `test/`.

## Tests

vitest with a jsdom environment (`vitest.config.mjs`); specs live in `test/` rather than next to the sources, because `src/` is published unbuilt. Tests import `describe`/`expect`/`vi` from `vitest` explicitly (no globals). Each test writes the button and container markup into the ambient `document` and stubs the global `fetch` with `vi.stubGlobal` (`stubServer()`), returning queued `{ posts, more }` bodies as real `Response` objects, or one of the `failures` for the error paths. Call `await loader.onClick()` to run a full load cycle without going through a DOM click.

## Releases

`task release` runs release-it (`.release-it.yaml`) on `main`, the only long-lived branch. It runs `task test`, bumps the version in `package.json` and `package-lock.json`, commits `chore: Release vX.Y.Z`, tags, pushes, publishes to npm (requires `npm login`) and opens the GitHub release form in the browser. The release notes are built from the commits since the previous tag. What ends up in the npm package is controlled by `.npmignore`, so add new dev-only config files there.

npm's `latest` dist-tag currently points to `0.2.0-beta.1`, an untracked 2022 build experiment with the same `src/` as `0.1.0`. The next release is `1.0.0`, which also makes `latest` the highest published version again.

## Architecture

### Server contract

`getMorePosts()` increments `currentPage` (starting from 1 on the first click) and fetches `getRequestPath(page)`, by default `/wp-json/${apiNamespace}/v${apiVersion}/${apiPath}?page=N` built from `getDefaultOptions()` (`ghwp`, `1`, `posts/load-more`). The response must be JSON `{ posts: string, more: boolean }`, where `posts` is an HTML fragment. Each top-level element of the fragment (parsed with `DOMParser`, taken from `body.children`) becomes one appended post. This matches the `ghwp/v1` namespace the PHP provider registers through `gebruederheitz/wp-simple-rest`.

### Click flow and events

`onClick` ignores clicks while `loading` is set. Otherwise it adds the `.busy` class to the button, emits `load:start` and awaits `getMorePosts()`. On success it calls `clearError()`, and removes the button and emits `posts:end` when `more` is falsy. On failure it calls `showError(error)` and emits `load:error`. Either way it removes `.busy` and emits `load:finish`. `parseAndAppendPosts` emits `posts:parsed` and `appendPosts` emits `post:append` per element. Events go through an internal [mitt](https://github.com/developit/mitt) emitter; `on()` returns a function that removes the listener (a no-op when the button is missing). The event names and payloads are documented in the README's events table and form the public API.

Failure behaviour: `getMorePosts()` rejects on network errors, non-OK HTTP statuses, invalid JSON and bodies without a `posts` string. It advances `currentPage` only after the response has been validated (and before appending, so an exception in a consumer's `post:append` listener can't cause the page to be appended twice), so a retry requests the same page. The default `showError()` logs the error, inserts a `p.ghwp-load-more__error[role=alert]` before the button (replaced, not updated, on every failure so screen readers announce it again), saves the button's `innerHTML` once and replaces it with `retryLabel`, and adds `.retry`. `clearError()` undoes all of that. Both are overridable hooks documented in the README. As a developer aid, `getMorePosts()` also fails without a request while the button has a `data-ghwp-simulate-error` attribute; it is read on every call so it can be toggled in the browser's inspector.

### Missing button

If `buttonSelector` matches nothing, the constructor returns early without creating `container`, `eventProxy` or the listener. `on()`, `onClick()` and `removeButton()` guard against this, so any new public method must do the same.

### Extension by subclassing

Consumers customise behaviour by extending `LoadMore` and overriding methods (see the README's "Extending functionality" section). The methods the README tells them to override — `initFilters()` (an empty hook called from the constructor before `listen()`) and `getRequestPath()` — plus `showError()`, `clearError()` and the documented `onClick()`, `removeButton()` and `on()` are effectively public API; changing their names, signatures or call order is a breaking change. `parseOptions()` shallow-merges user options over `getDefaultOptions()` and skips options set to `undefined`, so they keep their default.
