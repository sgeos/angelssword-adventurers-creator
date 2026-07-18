/**
 * Shared selectors / helpers for AS Adventurer browser characterization.
 */
const path = require('path');

const FIXTURES = path.join(__dirname, '../../fixtures/media');
const GREEN_SPRITE = path.join(FIXTURES, 'green-sprite.png');
const SPRITE_ON_GREEN = path.join(FIXTURES, 'sprite-on-green.png');

const TAB_IDS = [
  'tab-sprite-prep',
  'tab-video-gen',
  'tab-video-prep',
  'tab-exporter',
  'tab-settings',
];

/** Tiny fake MP4 bytes as base64 (not a real decoder stream — enough for Blob handoff). */
const FAKE_VIDEO_B64 = Buffer.from('ftypisomfake-video-bytes-for-characterization').toString('base64');

function interactionsVideoResponse(b64 = FAKE_VIDEO_B64) {
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

module.exports = {
  FIXTURES,
  GREEN_SPRITE,
  SPRITE_ON_GREEN,
  TAB_IDS,
  FAKE_VIDEO_B64,
  interactionsVideoResponse,
};
