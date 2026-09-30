/**
 * Shared selectors / helpers for AS Adventurer browser characterization.
 */
import path from 'node:path';
import { expect, type Page } from '@playwright/test';

// __dirname, not import.meta.url: Playwright transpiles specs to CommonJS,
// where import.meta does not exist. This file is only ever loaded by
// Playwright, so the CommonJS form is the correct one here.
export const FIXTURES: string = path.join(__dirname, '../../fixtures/media');
export const GREEN_SPRITE: string = path.join(FIXTURES, 'green-sprite.png');
export const SPRITE_ON_GREEN: string = path.join(FIXTURES, 'sprite-on-green.png');

/**
 * A real two second clip at thirty frames per second, so sixty frames, whose
 * frames visibly differ. Generated rather than recorded, and small enough to
 * commit: the loop controls cannot be exercised at all without a video the
 * browser will actually decode.
 */
export const LOOP_CLIP: string = path.join(FIXTURES, 'loop-clip.webm');

/**
 * The same clip at fifteen frames per second, so thirty frames rather than
 * sixty. Its only purpose is to show that a stage which assumes thirty frames
 * per second is wrong about it, which a clip at thirty cannot demonstrate.
 */
export const LOOP_CLIP_15FPS: string = path.join(FIXTURES, 'loop-clip-15fps.webm');

/**
 * Flip a styled toggle switch, and confirm it flipped.
 *
 * The page wraps a checkbox in a label and hides the input, the span beside it
 * being what a user clicks, so Playwright's `check` and `uncheck` cannot reach
 * the input at all. Clicking the span is both what a user does and the only
 * thing that establishes the visible control is wired to the input, which a
 * forced click on the hidden input would not.
 */
export async function toggleSwitch(page: Page, inputId: string): Promise<boolean> {
  const box = page.locator(`#${inputId}`);
  const before = await box.isChecked();
  await page.locator(`label.toggle-switch:has(#${inputId}) .slider`).click();
  await expect(box).toBeChecked({ checked: !before });
  return !before;
}

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

