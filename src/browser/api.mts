/**
 * Reading errors out of untyped API responses.
 */

/** Message text from a thrown or rejected value, without assuming Error. */
export const reasonText = (reason: unknown): string =>
  reason instanceof Error ? reason.message : String(reason);

/**
 * An error message from a response body.
 *
 * The body is untyped, so each step narrows. Checks `error.message` first,
 * then a bare `message`, matching the shapes the OpenAI and Gemini proxies
 * return. Yields undefined when neither is present, so callers can fall
 * back to the HTTP status rather than interpolating undefined into text a
 * user will read.
 */
export const responseErrorMessage = (body: unknown): string | undefined => {
  if (typeof body !== "object" || body === null) return undefined;
  if ("error" in body) {
    const error: unknown = body.error;
    if (typeof error === "object" && error !== null && "message" in error) {
      const message: unknown = error.message;
      if (typeof message === "string" && message !== "") return message;
    }
  }
  if ("message" in body) {
    const message: unknown = body.message;
    if (typeof message === "string" && message !== "") return message;
  }
  return undefined;
};
