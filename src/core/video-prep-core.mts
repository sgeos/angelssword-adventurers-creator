/**
 * Pure logic extracted from video-prep.
 */

export type LoopMode = "none" | "reverse" | "pingpong";

export interface FrameCountOptions {
  /**
   * First frame of the loop, inclusive. Defaults to 0, which is where every
   * loop began before the control could express a start.
   */
  readonly loopStart?: number;
  /** Last frame of the loop, inclusive. */
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
  const start = opts.loopStart ?? 0;
  // A span below 2 means no usable loop. With a start of 0 this is the old
  // `loopPoint < 2` test unchanged, which is what keeps every existing
  // caller and every existing expectation intact.
  const span = opts.loopPoint - start;
  if (span < 2) return opts.totalFrames;
  const n = span + 1; // frames start..loopPoint, inclusive
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
  loopStart = 0,
): LoopSummary => {
  const outputFrames = getOutputFrameCount({ loopStart, loopPoint, loopMode, totalFrames });
  const end = loopPoint.toString();
  const from = loopStart.toString();
  const label = loopMode === "pingpong"
    ? `Ping-Pong: ${from} → ${end} → ${from}`
    : loopMode === "reverse"
      ? `Reverse: ${end} → ${from}`
      : `Forward: ${from} → ${end}`;
  const known = loopMode === "none" || loopMode === "reverse" || loopMode === "pingpong"
    ? loopMode
    : undefined;
  return {
    outputFrames,
    label,
    modeLabel: known === undefined ? loopMode : LOOP_MODE_LABELS[known],
  };
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
  /** First frame of the loop. Absent means 0, for a caller predating it. */
  readonly loopStart?: number;
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
  /**
   * First frame of the loop, inclusive.
   *
   * Added when the control gained a start. Required rather than optional,
   * because a consumer reading a range needs both ends and silently treating
   * an absent start as 0 is how a field comes to be written and never read.
   */
  readonly loopStart: number;
  /** Last frame of the loop, inclusive. */
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
  loopStart: state.loopStart ?? 0,
  loopPoint: state.loopPoint,
  outputFrameCount: getOutputFrameCount({
    loopStart: state.loopStart ?? 0,
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

/* ────────────────────────────────────────────────────────────────────────
 * Carrying the loop across to the exporter.
 * ──────────────────────────────────────────────────────────────────────── */

/** A frame range for the exporter, inclusive at both ends. */
export interface ExportRange {
  readonly start: number;
  readonly end: number;
}

/**
 * The frame range a handoff asks the exporter to use.
 *
 * # Why this did not exist
 *
 * `loopPoint` has always been written into the handoff and never read. The
 * exporter takes `loopMode` from it, so ping-pong and reverse carry across,
 * and then takes its frame range from its own two inputs, which are reset to
 * the whole clip every time a clip loads.
 *
 * The consequence was silent and large. A loop set at frame 74 of 300 with
 * ping-pong produced an export of 598 frames over the whole clip rather than
 * the 148 the panel promised. The field was written, ignored, and the panel
 * reported a number the export did not honour.
 *
 * This is the mirror of the `keyColor` defect reported upstream, which was a
 * field read with no producer. Both predate this fork.
 *
 * # When there is no range
 *
 * Returns undefined when no loop was set, which the control expresses as a
 * loop point below 2. The exporter then keeps its own default of the whole
 * clip, which is the behaviour anyone who never set a loop point already has.
 *
 * A loop point beyond the clip is clamped rather than refused. It cannot
 * arise from the control, which takes the value from the current frame, but
 * the handoff is an object another stage could write.
 */
export const exportRangeFromHandoff = (
  payload: Pick<HandoffPayload, "loopPoint" | "totalFrames"> & { readonly loopStart?: number },
): ExportRange | undefined => {
  const start = Math.max(0, payload.loopStart ?? 0);
  if (payload.loopPoint - start < 2) return undefined;
  const lastFrame = Math.max(0, payload.totalFrames - 1);
  return {
    start: Math.min(start, lastFrame),
    end: Math.min(payload.loopPoint, lastFrame),
  };
};
