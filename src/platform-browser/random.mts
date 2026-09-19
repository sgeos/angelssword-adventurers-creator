/**
 * Seed generation.
 *
 * # Why this is not a capability interface
 *
 * The core never draws a random number. It takes a seed, which the reference
 * project this architecture follows states as a property of its rules crate:
 * a complete run is reproducible from a seed and an ordered list of inputs.
 * A core that receives the value rather than a generator cannot be
 * non-deterministic even by accident, and needs no interface to be handed
 * one.
 *
 * So the generator lives here, in the platform, where `Math.random` is
 * permitted, and the value crosses the boundary rather than the source.
 *
 * # What the seed is for
 *
 * ComfyUI takes a seed per generation. Reusing one reproduces an image
 * exactly, which is why a fresh one is drawn per request and why the drawn
 * value is worth surfacing to a caller that wants to repeat a result.
 */

/**
 * The exclusive upper bound on a drawn seed.
 *
 * A thousand million, which is what the sprite and video stages each used
 * before this was collected into one place. It is comfortably inside the
 * range ComfyUI accepts and inside exact integer representation.
 */
export const SEED_LIMIT = 1_000_000_000;

/** A fresh seed for one generation. */
export const drawSeed = (): number => Math.floor(Math.random() * SEED_LIMIT);
