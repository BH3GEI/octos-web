import { useRef, useState } from "react";
import { Play, Pause, Volume2 } from "lucide-react";

interface MediaPlayerProps {
  src: string;
  type: "audio" | "video";
  title?: string;
}

export function MediaPlayer({ src, type, title }: MediaPlayerProps) {
  const ref = useRef<HTMLAudioElement | HTMLVideoElement>(null);
  const [playing, setPlaying] = useState(false);
  const [progress, setProgress] = useState(0);
  const [duration, setDuration] = useState(0);

  function toggle() {
    if (!ref.current) return;
    if (playing) {
      ref.current.pause();
    } else {
      ref.current.play();
    }
    setPlaying(!playing);
  }

  function onTimeUpdate() {
    if (!ref.current) return;
    setProgress(ref.current.currentTime);
  }

  function onLoadedMetadata() {
    if (!ref.current) return;
    setDuration(ref.current.duration);
  }

  function onEnded() {
    setPlaying(false);
    setProgress(0);
  }

  function seek(e: React.MouseEvent<HTMLDivElement>) {
    if (!ref.current || !duration) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const pct = (e.clientX - rect.left) / rect.width;
    ref.current.currentTime = pct * duration;
  }

  function formatTime(s: number) {
    const m = Math.floor(s / 60);
    const sec = Math.floor(s % 60);
    return `${m}:${sec.toString().padStart(2, "0")}`;
  }

  const pct = duration > 0 ? (progress / duration) * 100 : 0;

  return (
    <div className="my-2 rounded-lg border border-border bg-surface-light p-3">
      {type === "video" ? (
        <video
          ref={ref as React.RefObject<HTMLVideoElement>}
          src={src}
          onTimeUpdate={onTimeUpdate}
          onLoadedMetadata={onLoadedMetadata}
          onEnded={onEnded}
          className="mb-2 w-full rounded"
          playsInline
        />
      ) : (
        <audio
          ref={ref as React.RefObject<HTMLAudioElement>}
          src={src}
          onTimeUpdate={onTimeUpdate}
          onLoadedMetadata={onLoadedMetadata}
          onEnded={onEnded}
        />
      )}

      <div className="flex items-center gap-3">
        <button
          onClick={toggle}
          className="flex h-8 w-8 items-center justify-center rounded-full bg-accent text-surface-dark transition hover:bg-accent-dim"
        >
          {playing ? <Pause size={14} /> : <Play size={14} />}
        </button>

        <div
          className="relative h-1.5 flex-1 cursor-pointer rounded-full bg-surface-dark"
          onClick={seek}
        >
          <div
            className="absolute inset-y-0 left-0 rounded-full bg-accent"
            style={{ width: `${pct}%` }}
          />
        </div>

        <span className="text-xs tabular-nums text-muted">
          {formatTime(progress)} / {formatTime(duration)}
        </span>

        <Volume2 size={14} className="text-muted" />
      </div>

      {title && (
        <div className="mt-1 truncate text-xs text-muted">{title}</div>
      )}
    </div>
  );
}
