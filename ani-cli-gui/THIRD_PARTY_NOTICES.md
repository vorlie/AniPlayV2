# Third-Party Notices

## FFmpeg

AniPlay distributes an FFmpeg 6.1.1 executable supplied by the `ffmpeg-static` 5.3.0 package. FFmpeg is a separate executable used to download and remux media streams.

- FFmpeg project: https://ffmpeg.org/
- FFmpeg source for the bundled version: https://ffmpeg.org/releases/ffmpeg-6.1.1.tar.xz
- Binary packaging source and build information: https://github.com/eugeneware/ffmpeg-static/tree/5.3.0
- License: GNU General Public License version 3 or later

The complete FFmpeg license and binary-provider README are included beside the executable in the packaged application's `resources/bin` directory. AniPlay does not modify the bundled FFmpeg executable.

## WebTorrent

AniPlay includes WebTorrent 3.0.16 and its packaged runtime dependencies to provide opt-in peer-to-peer media streaming.

- Project: https://webtorrent.io/
- Source: https://github.com/webtorrent/webtorrent
- License: MIT
- Copyright: Feross Aboukhadijeh and WebTorrent, LLC

The WebTorrent package and its dependency licence files remain available in the packaged application's resources.
