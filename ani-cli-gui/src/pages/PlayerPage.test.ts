import { describe, expect, it } from "vitest";
import { getNextSubtitleTrackIndex } from "../lib/player-subtitles";

describe("PlayerPage subtitle selection", () => {
  it("cycles through each caption option and turns captions off afterward", () => {
    expect(getNextSubtitleTrackIndex(-1, 2)).toBe(0);
    expect(getNextSubtitleTrackIndex(0, 2)).toBe(1);
    expect(getNextSubtitleTrackIndex(1, 2)).toBe(-1);
    expect(getNextSubtitleTrackIndex(0, 1)).toBe(-1);
  });
});
