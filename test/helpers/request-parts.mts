import { at } from "./at.mts";
import type { RequestInput, RequestPart } from "../../src/browser/video-gen-core.mts";

/**
 * A request body's input is either a bare prompt string or structured
 * parts. These narrow to what a test expects and fail with a message
 * naming the mismatch, rather than the test asserting through a union.
 */
export const parts = (input: RequestInput): readonly RequestPart[] => {
  if (typeof input === "string") {
    throw new Error(`expected structured input parts, got the plain prompt ${JSON.stringify(input)}`);
  }
  return input;
};

export const imagePart = (
  input: RequestInput,
  index: number,
): { readonly type: "image"; readonly data: string; readonly mime_type: string } => {
  const part = at(parts(input), index);
  if (part.type !== "image") throw new Error(`part ${index.toString()} is ${part.type}, not an image`);
  return part;
};

export const textPart = (
  input: RequestInput,
  index: number,
): { readonly type: "text"; readonly text: string } => {
  const part = at(parts(input), index);
  if (part.type !== "text") throw new Error(`part ${index.toString()} is ${part.type}, not text`);
  return part;
};
