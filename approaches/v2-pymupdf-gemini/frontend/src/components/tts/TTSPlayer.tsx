import { useState, useRef, useEffect, useCallback, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { motion, AnimatePresence } from "framer-motion";
import {
  Play, Pause, SkipBack, SkipForward, Volume2, VolumeX,
  Settings2, Loader2, Mic, X,
} from "lucide-react";
import { ttsApi } from "../../services/api";
import { useTTSStore } from "../../store/ttsStore";

interface Props {
  documentId: string;
  chapters?: { title: string; label: string; char_offset: number; type: string }[];
  totalChars?: number;
}

export function TTSPlayer({ documentId, chapters = [], totalChars = 0 }: Props) {
  const audioRef = useRef<HTMLAudioElement>(null);
  const [showSettings, setShowSettings] = useState(false);
  const [muted, setMuted] = useState(false);
  const [hoveredChapter, setHoveredChapter] = useState<{ title: string; x: number } | null>(null);
  const store = useTTSStore();

  const { data: voices } = useQuery({ queryKey: ["voices"], queryFn: ttsApi.getVoices });

  const currentSeg = store.segments[store.currentSegmentIndex];

  // Chapter positions on the timeline (as percentages)
  const chapterMarks = useMemo(() => {
    if (!totalChars || !chapters.length || store.totalDuration <= 0) return [];
    return chapters.map(ch => ({
      label: ch.label || ch.title,
      pct: (ch.char_offset / totalChars) * 100,
      globalTime: (ch.char_offset / totalChars) * store.totalDuration,
    }));
  }, [chapters, totalChars, store.totalDuration]);

  // Audio events
  useEffect(() => {
    const a = audioRef.current;
    if (!a) return;

    const onTime = () => {
      const segTime = a.currentTime;
      store.setSegmentTime(segTime);

      const seg = store.segments[store.currentSegmentIndex];
      if (seg) {
        const globalTime = seg.timeStart + segTime;
        store.setCurrentTime(globalTime);

        // Word-level highlighting from boundaries
        const ms = segTime * 1000;
        let charOffset = -1;
        let activeWord = "";

        if (seg.boundaries.length > 0) {
          let prevOffset = -1;
          let prevWord = "";
          for (const b of seg.boundaries) {
            if (b.time_ms <= ms) {
              prevOffset = charOffset;
              prevWord = activeWord;
              charOffset = b.offset;
              activeWord = b.text;
            } else break;
          }
          // Use PREVIOUS boundary - current one is the word ABOUT to be spoken
          // This shifts highlight back by one word, fixing the one-sentence-ahead issue
          if (prevOffset >= 0) {
            charOffset = prevOffset;
            activeWord = prevWord;
          }
        }

        // Fallback: estimate from proportion
        if (charOffset < 0 && seg.duration > 0) {
          const pct = segTime / seg.duration;
          charOffset = seg.charStart + Math.floor(pct * (seg.charEnd - seg.charStart));
        }

        store.setActiveCharOffset(charOffset);
        store.setActiveWord(activeWord);
      }
    };

    const onMeta = () => {
      if (a.duration && isFinite(a.duration)) {
        const seg = store.segments[store.currentSegmentIndex];
        if (seg && Math.abs(a.duration - seg.duration) > 1) {
          store.updateSegment(seg.index, { duration: a.duration });
        }
      }
    };

    const onPlay = () => store.setPlaying(true);
    const onPause = () => store.setPlaying(false);
    const onCanPlay = () => store.setLoading(false);
    const onWaiting = () => store.setLoading(true);
    const onError = () => { store.setLoading(false); console.error("Audio error:", a.error); };

    const onEnded = () => {
      const nextIdx = store.currentSegmentIndex + 1;
      const next = store.segments[nextIdx];
      if (next && next.ready && next.audioUrl) {
        store.setCurrentSegment(nextIdx);
        a.src = next.audioUrl;
        a.load();
        a.play().catch(() => {});
      } else if (next && !next.ready) {
        store.setLoading(true);
        store.setCurrentSegment(nextIdx);
      } else {
        store.setPlaying(false);
        store.setActiveCharOffset(-1);
        store.setActiveWord("");
      }
    };

    a.addEventListener("timeupdate", onTime);
    a.addEventListener("loadedmetadata", onMeta);
    a.addEventListener("durationchange", onMeta);
    a.addEventListener("play", onPlay);
    a.addEventListener("pause", onPause);
    a.addEventListener("ended", onEnded);
    a.addEventListener("canplay", onCanPlay);
    a.addEventListener("waiting", onWaiting);
    a.addEventListener("error", onError);
    return () => {
      a.removeEventListener("timeupdate", onTime);
      a.removeEventListener("loadedmetadata", onMeta);
      a.removeEventListener("durationchange", onMeta);
      a.removeEventListener("play", onPlay);
      a.removeEventListener("pause", onPause);
      a.removeEventListener("ended", onEnded);
      a.removeEventListener("canplay", onCanPlay);
      a.removeEventListener("waiting", onWaiting);
      a.removeEventListener("error", onError);
    };
  }, [store.segments, store.currentSegmentIndex]);

  // Load audio when current segment becomes ready
  useEffect(() => {
    const a = audioRef.current;
    if (!a || !currentSeg?.ready || !currentSeg.audioUrl) return;
    const wasWaiting = store.isLoading;
    a.src = currentSeg.audioUrl;
    a.load();
    // If there's a pending seek, apply it once audio is loaded
    const pending = store.pendingSeekGlobal;
    if (pending >= 0 && currentSeg) {
      const localTime = pending - currentSeg.timeStart;
      a.addEventListener("canplay", function onReady() {
        a.removeEventListener("canplay", onReady);
        a.currentTime = Math.max(0, Math.min(a.duration || localTime, localTime));
        a.play().catch(() => {});
        store.setPendingSeek(-1);
      }, { once: true });
    } else if (wasWaiting || store.isPlaying) {
      a.play().catch(() => {});
    }
  }, [currentSeg?.ready, currentSeg?.audioUrl, store.currentSegmentIndex]);

  useEffect(() => { if (audioRef.current) audioRef.current.volume = muted ? 0 : store.volume; }, [store.volume, muted]);
  useEffect(() => { if (audioRef.current) audioRef.current.playbackRate = store.speed; }, [store.speed]);

  // Controls
  const toggle = useCallback(() => {
    const a = audioRef.current;
    if (!a) return;
    if (!currentSeg?.ready) { store.setLoading(true); return; }
    if (a.paused) {
      if (!a.src) { a.src = currentSeg.audioUrl!; a.load(); }
      a.play().catch((err) => {
        console.error("Play failed:", err);
        a.src = currentSeg.audioUrl!; a.load();
        setTimeout(() => a.play().catch(() => {}), 300);
      });
    } else a.pause();
  }, [currentSeg]);

  const skip = (secs: number) => {
    seekToGlobal(Math.max(0, Math.min(store.totalDuration, store.currentTime + secs)));
  };

  const seekToGlobal = (gt: number) => {
    for (const seg of store.segments) {
      const end = seg.timeStart + seg.duration;
      if (gt >= seg.timeStart && gt < end) {
        const local = gt - seg.timeStart;
        if (seg.index !== store.currentSegmentIndex) store.setCurrentSegment(seg.index);
        if (seg.ready && audioRef.current) audioRef.current.currentTime = local;
        else { store.setLoading(true); store.setCurrentSegment(seg.index); }
        store.setCurrentTime(gt);
        return;
      }
    }
  };

  const handleTrackClick = (e: React.MouseEvent<HTMLDivElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const pct = (e.clientX - rect.left) / rect.width;
    seekToGlobal(pct * store.totalDuration);
  };

  const handleTrackHover = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!chapterMarks.length) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const pct = ((e.clientX - rect.left) / rect.width) * 100;
    // Find closest chapter within 2% of hover position
    const close = chapterMarks.find(c => Math.abs(c.pct - pct) < 2);
    if (close) {
      setHoveredChapter({ title: close.label, x: e.clientX - rect.left });
    } else {
      setHoveredChapter(null);
    }
  };

  const pct = store.totalDuration > 0 ? (store.currentTime / store.totalDuration) * 100 : 0;
  const readyPct = store.segments.length > 0
    ? (store.segments.filter(s => s.ready).length / store.segments.length) * 100 : 0;

  const fmt = (s: number) => {
    if (!s || !isFinite(s)) return "0:00";
    const h = Math.floor(s / 3600);
    const m = Math.floor((s % 3600) / 60);
    const sec = Math.floor(s % 60);
    if (h > 0) return `${h}:${m.toString().padStart(2, "0")}:${sec.toString().padStart(2, "0")}`;
    return `${m}:${sec.toString().padStart(2, "0")}`;
  };

  return (
    <>
      <audio ref={audioRef} preload="auto" />
      <motion.div className="player" initial={{ y: 80 }} animate={{ y: 0 }} transition={{ type: "spring", stiffness: 300, damping: 30 }}>
        {/* Progress track with chapter marks */}
        <div className="player__track" onClick={handleTrackClick} onMouseMove={handleTrackHover} onMouseLeave={() => setHoveredChapter(null)}>
          <div className="player__buffered" style={{ width: `${readyPct}%` }} />
          <div className="player__fill" style={{ width: `${pct}%` }} />
          <div className="player__knob" style={{ left: `${pct}%` }} />

          {/* Chapter tick marks */}
          {chapterMarks.map((ch, i) => (
            <div key={i} className="player__chapter-tick"
              style={{ left: `${ch.pct}%` }}
              onClick={(e) => { e.stopPropagation(); seekToGlobal(ch.globalTime); }}
            />
          ))}

          {/* Hover tooltip */}
          {hoveredChapter && (
            <div className="player__tooltip" style={{ left: hoveredChapter.x }}>
              {hoveredChapter.title}
            </div>
          )}
        </div>

        <div className="player__row">
          <span className="player__time">{fmt(store.currentTime)}</span>

          <div className="player__transport">
            <button className="p-btn p-btn--sm" onClick={() => skip(-10)}><SkipBack size={15} /></button>
            <button className="p-btn p-btn--play" onClick={toggle}>
              {store.isLoading ? <Loader2 size={20} className="spin" /> : store.isPlaying ? <Pause size={20} /> : <Play size={20} style={{ marginLeft: 2 }} />}
            </button>
            <button className="p-btn p-btn--sm" onClick={() => skip(10)}><SkipForward size={15} /></button>
          </div>

          <span className="player__time">{fmt(store.totalDuration)}</span>

          <span className="player__seg-info">
            {store.segments.filter(s => s.ready).length}/{store.segments.length}
          </span>

          <select className="player__speed" value={store.speed} onChange={e => store.setSpeed(+e.target.value)}>
            {[0.5, 0.75, 1, 1.25, 1.5, 2].map(s => <option key={s} value={s}>{s}x</option>)}
          </select>

          <button className="p-btn p-btn--ghost" onClick={() => setMuted(!muted)}>
            {muted ? <VolumeX size={15} /> : <Volume2 size={15} />}
          </button>
          <input type="range" className="player__vol" min={0} max={1} step={0.05}
            value={muted ? 0 : store.volume} onChange={e => { store.setVolume(+e.target.value); setMuted(false); }} />

          <button className="p-btn p-btn--ghost" onClick={() => setShowSettings(!showSettings)}>
            {showSettings ? <X size={15} /> : <Settings2 size={15} />}
          </button>
        </div>

        <AnimatePresence>
          {showSettings && (
            <motion.div className="player__settings" initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }} exit={{ height: 0, opacity: 0 }}>
              <label className="voice-label"><Mic size={13} /> Voice</label>
              <div className="voice-grid">
                {(voices || []).map(v => (
                  <button key={v.id} className={`voice-chip ${store.voiceId === v.id ? "voice-chip--on" : ""}`}
                    onClick={() => store.setVoice(v.id)}>
                    <span className="voice-chip__name">{v.name}</span>
                    <span className="voice-chip__sub">{v.gender} , {v.style}</span>
                  </button>
                ))}
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </motion.div>
    </>
  );
}
