export function getNextSubtitleTrackIndex(
  currentIndex: number,
  totalTracks: number,
) {
  if (!Number.isInteger(totalTracks) || totalTracks <= 0) return -1;
  if (currentIndex < 0) return 0;
  if (currentIndex + 1 >= totalTracks) return -1;
  return currentIndex + 1;
}
