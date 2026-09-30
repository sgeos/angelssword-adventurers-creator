import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * THE DEFECT THIS EXISTS FOR.
 *
 * The container image built cleanly and then exited at startup on
 * `ERR_MODULE_NOT_FOUND` for `src/core/providers.mts`. The runtime stage
 * copied `server.mts` and `public/` and nothing else, which was correct while
 * the server was self-contained. The layering work then gave the server an
 * import from the portable core, and nothing connected the two facts: the
 * build still succeeded, the tests still passed, and the failure appeared only
 * on `docker run`, which nobody had done in months.
 *
 * The general shape is that the server's runtime dependencies and the files
 * the image carries are two lists maintained by hand in different files, with
 * no check that they agree. This is that check.
 *
 * The standalone binary is deliberately not covered, because it is not exposed
 * to this: `build-exe.mts` runs esbuild with `--bundle`, which follows the
 * imports and inlines them, so its entry point has no runtime file
 * dependencies to omit.
 *
 * WHAT THIS DOES NOT ESTABLISH. It reads text; it does not run a container.
 * A passing run here means the copied set covers the import graph, not that
 * the image starts. Only building and running it shows that, and the result of
 * doing so is recorded in docs/process/VERIFICATION.md.
 */

const ROOT: string = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..', '..');

/** A specifier inside a comment is not an import. */
const stripComments = (source: string): string =>
    source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/[^\n]*/g, '$1');

/**
 * An import or re-export carrying a module specifier. The body cannot contain
 * a semicolon, which keeps a match inside one statement.
 */
const SPECIFIER = /(?:^|\n)\s*(?:import|export)\s+(type\s+)?[^;]*?from\s*['"]([^'"]+)['"]/g;

/**
 * The relative specifiers a load of this file will actually resolve.
 *
 * A statement beginning `import type` is erased before Node sees it, so it
 * demands nothing at runtime. Anything else is treated as a real dependency,
 * including `import { type X }`, which keeps its statement. Erring toward
 * including a file is the safe direction: it can only require that more be
 * copied.
 */
const runtimeImports = (file: string): string[] => {
    const source = stripComments(readFileSync(file, 'utf8'));
    const found: string[] = [];
    for (const match of source.matchAll(SPECIFIER)) {
        const specifier = match[2];
        if (match[1] !== undefined || specifier === undefined) continue;
        if (!specifier.startsWith('.')) continue;
        found.push(resolve(dirname(file), specifier));
    }
    return found;
};

interface Closure {
    /** Every file a load of the entry point reaches, excluding the entry. */
    readonly files: readonly string[];
    /** Specifiers that resolved to nothing, which is a defect in itself. */
    readonly missing: readonly string[];
}

/**
 * Terminates because a file is added to `seen` before its imports are queued
 * and is skipped on any later visit, so each of a finite set of files is
 * expanded at most once. A cycle is therefore safe.
 */
const closureOf = (entry: string): Closure => {
    const seen = new Set<string>([entry]);
    const missing: string[] = [];
    const queue: string[] = [entry];
    while (queue.length > 0) {
        const file = queue.pop();
        if (file === undefined) continue;
        for (const dependency of runtimeImports(file)) {
            if (!existsSync(dependency)) {
                missing.push(relative(ROOT, dependency));
                continue;
            }
            if (seen.has(dependency)) continue;
            seen.add(dependency);
            queue.push(dependency);
        }
    }
    seen.delete(entry);
    return { files: [...seen].map((f) => relative(ROOT, f)), missing };
};

/**
 * The paths the final image stage copies out of the build context.
 *
 * Stages are split on `FROM`, and only the last one produces the image that
 * runs. A `--from` copy takes its source from an earlier stage rather than the
 * context, so it cannot satisfy a source-file dependency and is ignored.
 */
const copiedIntoImage = (): string[] => {
    const text = readFileSync(join(ROOT, 'Dockerfile'), 'utf8');
    const stages = text.split(/^FROM /m);
    const runtime = stages[stages.length - 1];
    assert.ok(runtime !== undefined, 'the Dockerfile declares no stage');

    const sources: string[] = [];
    for (const line of runtime.split('\n')) {
        const copy = /^COPY\s+(.+)$/.exec(line.trim());
        if (copy === null) continue;
        const argument = copy[1];
        if (argument === undefined || argument.includes('--from')) continue;
        const tokens = argument.split(/\s+/).filter((t) => t.length > 0);
        // The last token is the destination inside the image.
        sources.push(...tokens.slice(0, -1));
    }
    return sources;
};

/** Whether a repository-relative path is carried by one of the copied paths. */
const isCarriedBy = (path: string, sources: readonly string[]): boolean =>
    sources.some((source) => {
        const normalised = source.replace(/^\.\//, '');
        if (normalised === path) return true;
        const asDirectory = normalised.endsWith('/') ? normalised : `${normalised}/`;
        return path.startsWith(asDirectory);
    });

describe('the container carries everything the server loads', () => {
    const server = join(ROOT, 'server.mts');

    it('resolves every relative import the server reaches', () => {
        const { missing } = closureOf(server);
        assert.deepEqual(missing, [], 'these specifiers resolve to no file');
    });

    /**
     * THE ASSERTION THAT WOULD HAVE CAUGHT IT. At the time of the failure the
     * closure held `src/core/providers.mts` and the copied set held only
     * `server.mts` and `public/`.
     */
    it('copies every file in that closure into the final stage', () => {
        const { files } = closureOf(server);
        const sources = copiedIntoImage();
        const omitted = files.filter((f) => !isCarriedBy(f, sources));
        assert.deepEqual(
            omitted,
            [],
            `the server loads these, and the image does not carry them: ${omitted.join(', ')}`
                + ` (copied: ${sources.join(', ')})`,
        );
    });

    it('copies the entry point itself', () => {
        assert.ok(isCarriedBy('server.mts', copiedIntoImage()));
    });

    /**
     * A guard against the check passing vacuously. If the closure were empty,
     * or the Dockerfile parse returned nothing, the assertion above would
     * succeed while establishing nothing.
     */
    it('is not passing because it found nothing to check', () => {
        const { files } = closureOf(server);
        assert.ok(files.length > 0, 'the server imports no local file, which is no longer true');
        assert.ok(copiedIntoImage().length > 0, 'no COPY was parsed out of the runtime stage');
    });

    /**
     * The layering rule, observed from the other side. The server is a
     * platform consumer of the portable core, so its reach may include core
     * and may not include anything built for a browser or a worker.
     */
    it('reaches only the portable core, never a browser or worker layer', () => {
        for (const file of closureOf(server).files) {
            assert.ok(
                file.startsWith('src/core/'),
                `the server reaches ${file}, which is outside the portable core`,
            );
        }
    });
});
