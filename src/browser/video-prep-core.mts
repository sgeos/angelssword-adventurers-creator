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
