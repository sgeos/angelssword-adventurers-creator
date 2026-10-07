import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * The instruction files agents load, checked against the tree.
 *
 * Codex loads `AGENTS.md`. Grok Build loads `AGENTS.md` and `CLAUDE.md`
 * together. Claude Code loads `CLAUDE.md`. Each is a list of facts about the
 * repository written by hand, and on the day this test was written both files
 * carried facts the tree had stopped supporting: a project count of four where
 * there were five, a compiled-output path the layering work had moved, and a
 * browser test command that silently tests a stale bundle.
 *
 * That is the same category as the Dockerfile copy list and the documented
 * binary check that broke earlier: instructions about the code held where
 * nothing executes them. This executes the parts that can be checked
 * mechanically.
 *
 * WHAT THIS DOES NOT ESTABLISH. Prose is not checked for truth, only the
 * scripts, paths, links and counts it names. A file can pass this and still
 * describe the project wrongly.
 */

const ROOT: string = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..', '..');

/** The files an agent is told to read first. */
const ENTRY_FILES: readonly string[] = ['AGENTS.md', 'CLAUDE.md'];

/** Files whose commands an agent will run verbatim. */
const COMMAND_FILES: readonly string[] = [
    ...ENTRY_FILES,
    'docs/process/HANDOFF.md',
    'docs/process/VERIFICATION.md',
];

const read = (file: string): string => readFileSync(join(ROOT, file), 'utf8');

const scriptNames = (): ReadonlySet<string> => {
    const parsed: unknown = JSON.parse(read('package.json'));
    if (parsed === null || typeof parsed !== 'object' || !('scripts' in parsed)) return new Set();
    const scripts = parsed.scripts;
    if (scripts === null || typeof scripts !== 'object') return new Set();
    return new Set(Object.keys(scripts));
};

/** The bodies of fenced shell blocks, where commands meant to be run live. */
const shellBlocks = (text: string): string[] =>
    [...text.matchAll(/```(?:sh|bash|shell)\n([\s\S]*?)```/g)].map((m) => m[1] ?? '');

const NUMBER_WORDS: readonly string[] = [
    'zero', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten',
];

describe('agent instruction files agree with the tree', () => {
    it('name only npm scripts that exist', () => {
        const known = scriptNames();
        assert.ok(known.size > 0, 'no scripts parsed from package.json, so this would pass vacuously');
        for (const file of COMMAND_FILES) {
            for (const match of read(file).matchAll(/npm run ([a-z][\w:-]*)/g)) {
                const name = match[1] ?? '';
                assert.ok(known.has(name), `${file} names \`npm run ${name}\`, which package.json lacks`);
            }
        }
    });

    /**
     * The bare command reuses a running server and skips its rebuild. It may
     * be mentioned as the thing not to do, but never offered as a command.
     */
    it('never offer the bare Playwright command as one to run', () => {
        for (const file of ENTRY_FILES) {
            for (const block of shellBlocks(read(file))) {
                for (const line of block.split('\n')) {
                    assert.ok(
                        !line.trim().startsWith('npx playwright test'),
                        `${file} offers \`${line.trim()}\`; use npm run test:browser`,
                    );
                }
            }
        }
    });

    /** "Four projects" stood in AGENTS.md while five existed. */
    it('state the number of TypeScript projects correctly', () => {
        const actual = readdirSync(ROOT).filter((f) => /^tsconfig.*\.json$/.test(f)).length;
        const word = NUMBER_WORDS[actual];
        assert.ok(word !== undefined, `no number word for ${actual.toString()}`);
        let seen = 0;
        for (const file of ENTRY_FILES) {
            for (const match of read(file).matchAll(/\b([a-z]+)\s+(?:TypeScript\s+)?projects\b/gi)) {
                const stated = (match[1] ?? '').toLowerCase();
                if (!NUMBER_WORDS.includes(stated)) continue;
                seen += 1;
                assert.equal(stated, word, `${file} says "${match[0]}"; there are ${actual.toString()}`);
            }
        }
        assert.ok(seen > 0, 'neither file states the count, so this check reached nothing');
    });

    /**
     * Concrete repository paths in backticks must exist. Patterns containing
     * a wildcard or a placeholder are skipped, being descriptions of a shape
     * rather than of a file.
     */
    it('name only repository paths that exist', () => {
        let checked = 0;
        for (const file of ENTRY_FILES) {
            for (const match of read(file).matchAll(/`((?:src|test|docs|public)\/[\w./-]+)`/g)) {
                const path = match[1] ?? '';
                if (path.includes('*')) continue;
                checked += 1;
                assert.ok(existsSync(join(ROOT, path)), `${file} names \`${path}\`, which does not exist`);
            }
        }
        assert.ok(checked > 0, 'no paths were found to check');
    });

    it('link only to files that exist', () => {
        for (const file of ENTRY_FILES) {
            for (const match of read(file).matchAll(/\]\(([^)#]+)(?:#[^)]*)?\)/g)) {
                const target = match[1] ?? '';
                if (/^[a-z]+:/i.test(target)) continue;
                assert.ok(existsSync(join(ROOT, dirname(file), target)), `${file} links to missing ${target}`);
            }
        }
    });
});
