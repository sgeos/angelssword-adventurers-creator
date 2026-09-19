/**
 * Shared app utilities.
 */

/**
 * Delay a call until `ms` has passed without another call.
 *
 * The original forwarded `this` through `fn.apply(this, args)`. Every call
 * site passes an arrow function or a free function, so the receiver was
 * always undefined; typing it away removes the only reason this could not
 * be an arrow.
 */
export const debounce = <A extends readonly unknown[]>(
  fn: (...args: A) => void,
  ms: number,
): ((...args: A) => void) => {
  let timer: ReturnType<typeof setTimeout> | undefined;
  return (...args: A): void => {
    if (timer !== undefined) clearTimeout(timer);
    timer = setTimeout(() => {
      fn(...args);
    }, ms);
  };
};

/** Decode base64, with or without a data-URI prefix, into a Blob. */
export const base64ToBlob = (base64: string, mimeType = "image/png"): Blob => {
  const commaAt = base64.indexOf(",");
  const raw = commaAt === -1 ? base64 : base64.slice(commaAt + 1);
  const bytes = atob(raw);
  const arr = new Uint8Array(bytes.length);
  for (let i = 0; i < bytes.length; i++) arr[i] = bytes.charCodeAt(i);
  return new Blob([arr], { type: mimeType });
};

/**
 * Encode bytes as a data URI.
 *
 * The inverse of `base64ToBlob`, and the platform's answer to a core function
 * that yields a `Uint8Array`. The core produces bytes because bytes are the
 * language's; what to wrap them in is decided here.
 *
 * Accumulated one character at a time rather than through
 * `String.fromCharCode(...bytes)`, which exhausts the stack on a payload of
 * any size. A generated sprite is hundreds of kilobytes, so the spread form
 * would fail on real input and pass on every small test.
 */
export const bytesToDataUri = (bytes: Uint8Array, mimeType: string): string => {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return `data:${mimeType};base64,${btoa(binary)}`;
};

/**
 * Read a Blob as a data URI.
 *
 * `readAsDataURL` always yields a string, but `FileReader.result` is typed
 * for every read method at once, so the non-string cases are rejected
 * rather than assumed away.
 */
export const blobToBase64 = async (blob: Blob): Promise<string> =>
  new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (): void => {
      const { result } = reader;
      if (typeof result === "string") resolve(result);
      else reject(new Error("FileReader did not return a data URI"));
    };
    reader.onerror = (): void => {
      reject(reader.error ?? new Error("FileReader failed"));
    };
    reader.readAsDataURL(blob);
  });

export interface Rgb {
  readonly r: number;
  readonly g: number;
  readonly b: number;
}

/** Parse `#rrggbb` into components. */
export const hexToRgb = (hex: string): Rgb => ({
  r: parseInt(hex.slice(1, 3), 16),
  g: parseInt(hex.slice(3, 5), 16),
  b: parseInt(hex.slice(5, 7), 16),
});

const COLOR_NAMES: Readonly<Record<string, string>> = {
  "#00FF00": "Green",
  "#FF00FF": "Magenta",
  "#0000FF": "Blue",
  "#FFFF00": "Yellow",
  "#00FFFF": "Cyan",
};

/** Friendly name for a known key colour, or the hex itself. */
export const colorName = (hex: string): string => COLOR_NAMES[hex.toUpperCase()] ?? hex;
