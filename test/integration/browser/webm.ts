/**
 * The presentation timestamps of a WebM file's video frames, in seconds.
 *
 * Enough of the Matroska container to answer one question, how many frames a
 * file holds and when each is shown, without a media tool, which continuous
 * integration does not install. It reads the stream linearly: a master
 * element of interest is stepped into, any other element is skipped by its
 * size. MediaRecorder writes the segment and its clusters with unknown sizes,
 * which a linear reading handles without knowing where they end.
 *
 * It assumes one video track, which is what the exporter writes. The spec
 * that uses it checks it first against a fixture whose frames are known.
 */

const SEGMENT = 0x18538067;
const INFO = 0x1549a966;
const TIMECODE_SCALE = 0x2ad7b1;
const CLUSTER = 0x1f43b675;
const CLUSTER_TIMECODE = 0xe7;
const BLOCK_GROUP = 0xa0;
const BLOCK = 0xa1;
const SIMPLE_BLOCK = 0xa3;

/** Elements stepped into rather than skipped. */
const MASTERS: ReadonlySet<number> = new Set([SEGMENT, INFO, CLUSTER, BLOCK_GROUP]);

/** A variable-length integer: its value, with or without the length marker, and its length. */
const vint = (bytes: Uint8Array, at: number, keepMarker: boolean): { value: number; length: number; unknown: boolean } => {
    const first = bytes[at];
    if (first === undefined || first === 0) throw new Error(`No variable-length integer at ${at.toString()}`);
    let length = 1;
    while (length <= 8 && (first & (0x80 >> (length - 1))) === 0) length += 1;
    let value = keepMarker ? first : first & (0xff >> length);
    let allOnes = (first & (0xff >> length)) === 0xff >> length;
    for (let i = 1; i < length; i += 1) {
        const next = bytes[at + i];
        if (next === undefined) throw new Error(`Truncated variable-length integer at ${at.toString()}`);
        value = value * 256 + next;
        allOnes &&= next === 0xff;
    }
    return { value, length, unknown: !keepMarker && allOnes };
};

const unsigned = (bytes: Uint8Array, at: number, size: number): number => {
    let value = 0;
    for (let i = 0; i < size; i += 1) value = value * 256 + (bytes[at + i] ?? 0);
    return value;
};

export const webmFrameTimes = (bytes: Uint8Array): number[] => {
    let scale = 1_000_000;
    let clusterTime = 0;
    const times: number[] = [];
    let at = 0;
    // Each pass moves past at least one element header, so `at` strictly
    // grows and the loop ends at the end of the bytes.
    while (at < bytes.length) {
        const id = vint(bytes, at, true);
        const size = vint(bytes, at + id.length, false);
        const body = at + id.length + size.length;
        if (MASTERS.has(id.value)) {
            at = body;
            continue;
        }
        if (size.unknown) throw new Error(`Element ${id.value.toString(16)} has an unknown size`);
        if (id.value === TIMECODE_SCALE) scale = unsigned(bytes, body, size.value);
        if (id.value === CLUSTER_TIMECODE) clusterTime = unsigned(bytes, body, size.value);
        if (id.value === SIMPLE_BLOCK || id.value === BLOCK) {
            const track = vint(bytes, body, false);
            const high = bytes[body + track.length] ?? 0;
            const low = bytes[body + track.length + 1] ?? 0;
            const relative = ((high << 8) | low) << 16 >> 16;
            times.push(((clusterTime + relative) * scale) / 1e9);
        }
        at = body + size.value;
    }
    return times.sort((a, b) => a - b);
};
