/**
 * The application, which is one page.
 *
 * Rendered in the browser only, as every route but the root is under the
 * single-page build; see `start.ts`. The stage controllers find their elements in the live
 * document, so there is nothing for a server render to contribute.
 */
import { createFileRoute } from "@tanstack/react-router";
import { App } from "../app/App.tsx";

export const Route = createFileRoute("/")({ component: App });
