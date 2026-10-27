// @vitest-environment node
import { execFileSync } from 'node:child_process';
import { execPath } from 'node:process';

import { describe, expect, it } from 'vitest';

/**
 * vitest resolves modules through Vite, which tolerates what strict ESM
 * resolution doesn't (extensionless paths, CommonJS named imports). To make
 * sure consumers can import the package without a forgiving bundler, these
 * tests import it by its package name in a plain Node process.
 */

function importInNode(code) {
    return execFileSync(execPath, ['--input-type=module', '-e', code], {
        encoding: 'utf-8',
    }).trim();
}

describe('The package', () => {
    it('exports LoadMore from its entry point under strict ESM', () => {
        const output = importInNode(
            "import { LoadMore } from '@gebruederheitz/wp-async-posts-loader'; console.log(typeof LoadMore);"
        );

        expect(output).toBe('function');
    });

    it('does not expose its internal files', () => {
        expect(() =>
            importInNode(
                "await import('@gebruederheitz/wp-async-posts-loader/src/load-more.js');"
            )
        ).toThrow(/ERR_PACKAGE_PATH_NOT_EXPORTED/);
    });
});
