/**
 * Shared selectors / helpers for AS Adventurer browser characterization.
 */
import path from 'node:path';

// __dirname, not import.meta.url: Playwright transpiles specs to CommonJS,
// where import.meta does not exist. This file is only ever loaded by
// Playwright, so the CommonJS form is the correct one here.
export const FIXTURES: string = path.join(__dirname, '../../fixtures/media');
export const GREEN_SPRITE: string = path.join(FIXTURES, 'green-sprite.png');
export const SPRITE_ON_GREEN: string = path.join(FIXTURES, 'sprite-on-green.png');

export const TAB_IDS: readonly string[] = [
  'tab-sprite-prep',
  'tab-video-gen',
  'tab-video-prep',
  'tab-exporter',
  'tab-settings',
];

/** Tiny fake MP4 bytes as base64 (not a real decoder stream — enough for Blob handoff). */
export const FAKE_VIDEO_B64: string = Buffer.from('ftypisomfake-video-bytes-for-characterization').toString('base64');

/** One completed Gemini Interactions response carrying an inline video. */
export interface InteractionsResponse {
  readonly id: string;
  readonly status: string;
  readonly model: string;
  readonly steps: readonly unknown[];
}

export function interactionsVideoResponse(b64: string = FAKE_VIDEO_B64): InteractionsResponse {
  return {
    id: 'test-interaction-1',
    status: 'completed',
    model: 'gemini-omni-flash-preview',
    steps: [
      { type: 'user_input', content: [{ type: 'text', text: 'test' }] },
      {
        type: 'model_output',
        content: [{ type: 'video', mime_type: 'video/mp4', data: b64 }],
      },
    ],
  };
}

