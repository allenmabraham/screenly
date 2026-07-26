/**
 * Shared between the player (client) and the viewer page (server).
 *
 * It deliberately lives outside `video-player.tsx`: non-component exports from a
 * `"use client"` module become client references on the server, so a Server
 * Component cannot read their actual values.
 */
export const PLAYER_SHORTCUTS: Array<[string, string]> = [
  ["Space / K", "Play or pause"],
  ["← / →", "Back or forward 5s"],
  ["J / L", "Back or forward 10s"],
  ["↑ / ↓", "Volume"],
  ["0 – 9", "Jump to 0–90%"],
  ["M", "Mute"],
  ["F", "Full screen"],
  ["< / >", "Slower or faster"],
];
