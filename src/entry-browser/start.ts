/**
 * The TanStack Start instance.
 *
 * No route is rendered on the server by default. The build prerenders the
 * root route alone, which is the document shell, and the browser renders
 * everything inside it. Set here, once, rather than on each route: a route
 * marked `ssr: false` beside a prerendered parent left the shell and the
 * browser's first render disagreeing about the outlet, which React reported
 * as a hydration mismatch on every load.
 */
import { createStart } from "@tanstack/react-start";

export const startInstance = createStart(() => ({ defaultSsr: false }));
