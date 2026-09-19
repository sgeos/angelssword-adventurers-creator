/**
 * Pure logic extracted from video-prep.
 */

export type LoopMode = "none" | "reverse" | "pingpong";

export interface FrameCountOptions {
  readonly loopPoint: number;
  readonly loopMode: string;
  readonly totalFrames: number;
}

/**
 * Frames an export produces for a given loop mode.
 *
 * A loop point below 2 means no loop was set, so the whole clip is used.
 */
export const getOutputFrameCount = (opts: FrameCountOptions): number => {
  if (opts.loopPoint < 2) return opts.totalFrames;
  const n = opts.loopPoint + 1; // frames 0..loopPoint
  // Ping-pong returns through the interior, so neither endpoint repeats.
  // Reverse and none both emit n frames, in opposite directions.
  return opts.loopMode === "pingpong" ? n + Math.max(0, n - 2) : n;
};

/**
 * How a loop mode is described in the information panel.
 *
 * The stage carried two label vocabularies for the same three modes, one on
 * the loop control and one in the panel, and they disagreed in wording while
 * agreeing in meaning. Both now come from here, so a fourth mode would be
 * added once.
 */
export const LOOP_MODE_LABELS: Readonly<Record<LoopMode, string>> = {
  none: "No Loop (forward only)",
  reverse: "Reverse (N→0)",
  pingpong: "Ping-Pong (0→N→0)",
};

/** What a set loop point produces, for display and for the export. */
export interface LoopSummary {
  /** Frames the export will emit. */
  readonly outputFrames: number;
  /** The loop control's label, naming the actual endpoints. */
  readonly label: string;
  /** The information panel's label, naming the mode. */
  readonly modeLabel: string;
}

/**
 * Describe a set loop point.
 *
 * # One duplication removed, and it was not a defect
 *
 * The stage computed its own output frame count in a three-case switch beside
 * the label, while [`getOutputFrameCount`] computed the same thing from a
 * different formula. The switch read `loopPoint * 2` for ping-pong and the
 * core read `n + max(0, n - 2)` with `n = loopPoint + 1`.
 *
 * **They agree**, which was checked rather than assumed: for a loop point of
 * `L` at least 1 the core expression is `(L + 1) + (L - 1)`, which is `2L`,
 * and the control refuses a loop point below 2. So nothing was wrong and one
 * of the two was still going to drift the first time either was edited.
 */
export const loopSummary = (
  loopMode: string,
  loopPoint: number,
  totalFrames: number,
): LoopSummary => {
  const outputFrames = getOutputFrameCount({ loopPoint, loopMode, totalFrames });
  const end = loopPoint.toString();
  const label = loopMode === "pingpong"
    ? `Ping-Pong: 0 → ${end} → 0`
    : loopMode === "reverse"
      ? `Reverse: ${end} → 0`
      : `Forward: 0 → ${end}`;
  const known = loopMode === "none" || loopMode === "reverse" || loopMode === "pingpong"
    ? loopMode
    : undefined;
  return {
    outputFrames,
    label,
    modeLabel: known === undefined ? loopMode : LOOP_MODE_LABELS[known],
  };
};

/**
 * The playback time of one frame, kept clear of the very end of the clip.
 *
 * The millisecond of slack matters. Seeking exactly to `duration` lands past
 * the last decodable frame in several browsers and yields either the previous
 * frame or nothing, so the final frame of a clip would not render. It is
 * preserved from the original rather than rounded off.
 */
export const FRAME_SEEK_EPSILON_SECONDS = 0.001;

/** Where in a clip a frame index sits. */
export const frameTime = (frameIndex: number, fps: number, duration: number): number =>
  Math.min(frameIndex / fps, duration - FRAME_SEEK_EPSILON_SECONDS);

/**
 * Move a frame index by one step, stopping at the ends.
 *
 * Returns the index unchanged at a boundary rather than wrapping, which is
 * what the two navigation buttons did with a guard each.
 */
export const stepFrame = (current: number, delta: number, totalFrames: number): number => {
  const next = current + delta;
  if (next < 0 || next > totalFrames - 1) return current;
  return next;
};

/** Playback order of frame indices for a loop mode. */
export const buildLoopSequence = (cachedLength: number, loopMode: string): number[] => {
  const sequence: number[] = [];
  if (loopMode === "pingpong") {
    for (let i = 0; i < cachedLength; i++) sequence.push(i);
    for (let j = cachedLength - 2; j >= 1; j--) sequence.push(j);
  } else if (loopMode === "reverse") {
    for (let r = cachedLength - 1; r >= 0; r--) sequence.push(r);
  } else {
    for (let f = 0; f < cachedLength; f++) sequence.push(f);
  }
  return sequence;
};

export interface CrossfadeStep {
  readonly t: number;
  readonly alpha1: number;
  readonly alpha2: number;
}

/**
 * Blend weights across a crossfade, from all-first to all-second.
 *
 * A count of 1 divides by zero and yields a non-finite t. That is the
 * existing behaviour and the tests pin it, so it is preserved rather than
 * quietly changed here.
 */
export const buildCrossfadeAlphas = (count: number): CrossfadeStep[] => {
  const result: CrossfadeStep[] = [];
  for (let i = 0; i < count; i++) {
    const t = i / (count - 1);
    result.push({ t, alpha1: 1 - t, alpha2: t });
  }
  return result;
};

/** The subset of video-prep state the handoff payload reads. */
export interface VideoPrepState {
  readonly video?: { readonly src?: string } | null;
  readonly videoWidth?: number;
  readonly videoHeight?: number;
  readonly duration?: number;
  readonly fps?: number;
  readonly totalFrames: number;
  readonly loopMode: string;
  readonly loopPoint: number;
  readonly concatVideo?: { readonly src?: string } | null;
  readonly concatWidth?: number;
  readonly concatHeight?: number;
  readonly concatDuration?: number;
  readonly concatFps?: number;
}

export interface HandoffOptions {
  readonly concatEnabled?: boolean;
  readonly crossfade?: boolean;
  readonly crossfadeDuration?: number;
}

export interface ConcatPayload {
  readonly videoSrc: string | undefined;
  readonly videoWidth: number | undefined;
  readonly videoHeight: number | undefined;
  readonly duration: number | undefined;
  readonly fps: number | undefined;
  readonly crossfade: boolean;
  readonly crossfadeDuration: number;
}

export interface HandoffPayload {
  readonly videoSrc: string | undefined;
  readonly videoWidth: number | undefined;
  readonly videoHeight: number | undefined;
  readonly duration: number | undefined;
  readonly fps: number | undefined;
  readonly totalFrames: number;
  readonly loopMode: string;
  readonly loopPoint: number;
  readonly outputFrameCount: number;
  readonly concat: ConcatPayload | null;
}

/** Payload handed to the exporter stage. */
export const buildVideoPrepHandoffPayload = (
  state: VideoPrepState,
  opts: HandoffOptions = {},
): HandoffPayload => ({
  videoSrc: state.video?.src,
  videoWidth: state.videoWidth,
  videoHeight: state.videoHeight,
  duration: state.duration,
  fps: state.fps,
  totalFrames: state.totalFrames,

  loopMode: state.loopMode,
  loopPoint: state.loopPoint,
  outputFrameCount: getOutputFrameCount({
    loopPoint: state.loopPoint,
    loopMode: state.loopMode,
    totalFrames: state.totalFrames,
  }),

  concat:
    opts.concatEnabled === true
      ? {
          videoSrc: state.concatVideo?.src,
          videoWidth: state.concatWidth,
          videoHeight: state.concatHeight,
          duration: state.concatDuration,
          fps: state.concatFps,
          crossfade: opts.crossfade === true,
          crossfadeDuration: opts.crossfadeDuration ?? 0,
        }
      : null,
});
