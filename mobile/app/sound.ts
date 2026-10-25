/**
 * The notification sound, played natively.
 *
 * The web view has no copy of the sound files at its address, so the stages
 * ask for the sound and this plays one of the two clips the browser plays,
 * bundled from the same files in public/assets/sounds.
 */
import { createAudioPlayer, type AudioPlayer } from "expo-audio";
import { loadSoundEnabled } from "../../src/core/preferences.mts";
import { nativeStore } from "./storage.ts";
import questComplete2 from "../../public/assets/sounds/quest_complete_2.mp3";
import questComplete10 from "../../public/assets/sounds/quest_complete_10.mp3";

const CLIPS: readonly number[] = [questComplete2, questComplete10];

let players: readonly AudioPlayer[] | undefined;

export const playSound = async (): Promise<void> => {
    if (!loadSoundEnabled(nativeStore)) return;
    players ??= CLIPS.map((clip) => createAudioPlayer(clip));
    const player = players[Math.floor(Math.random() * players.length)];
    if (player === undefined) return;
    await player.seekTo(0);
    player.play();
};
