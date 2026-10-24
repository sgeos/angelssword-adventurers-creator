/**
 * The router TanStack Start constructs, from the generated route tree.
 *
 * `routeTree.gen.ts` is written by the build from the files in `routes/`. It is
 * committed, so the typecheck does not depend on a build having run first, and
 * it is excluded from the lint by name, being the generator's text rather than
 * this project's.
 */
import { createRouter, type AnyRouter } from "@tanstack/react-router";
import { routeTree } from "./routeTree.gen.ts";

export const getRouter = (): AnyRouter => createRouter({ routeTree });
