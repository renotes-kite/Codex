# LiteCut - Lightweight Browser Video Editor

LiteCut is a browser-only non-linear video editor inspired by simplified CapCut/Premiere workflows.

## Features

- Media library with drag-and-drop import for video/audio/images
- Timeline with multiple tracks (video, audio, text)
- Clip move + trim (resize) + split + delete
- Track create/delete/reorder
- Real-time preview with timecode + playhead + speed control
- Text overlays on dedicated text track
- Audio clip controls (volume, mute, fade-in/out)
- Clip filter controls (brightness, contrast, saturation, grayscale, sepia)
- Timeline zoom and ruler
- In-browser export with selectable resolution (480p/720p/1080p)

## Run

```bash
python3 -m http.server 4173
```

Then open `http://localhost:4173`.

## Notes

- Export uses browser `MediaRecorder` and generates a WebM stream, downloaded as `.mp4` for compatibility in lightweight browser-only workflows.
- For production-grade MP4 muxing, integrate ffmpeg.wasm or a backend transcoding service.
