import { useState, useRef, useEffect, useMemo, useCallback } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { motion, AnimatePresence } from "framer-motion";
import { ArrowLeft, BookOpen, FileText, BarChart3, ChevronDown, ChevronUp, Zap, SkipForward, BookOpenCheck } from "lucide-react";
import { documentsApi, ttsApi } from "../../services/api";
import { TTSPlayer } from "../tts/TTSPlayer";
import { useTTSStore, Segment } from "../../store/ttsStore";
import toast from "react-hot-toast";

export function ReaderView() {
  const { docId } = useParams<{ docId: string }>();
  const navigate = useNavigate();
  const [showStats, setShowStats] = useState(false);
  const [showChapters, setShowChapters] = useState(false);
  const [genProgress, setGenProgress] = useState({ done: 0, total: 0 });
  const [showSkipChoice, setShowSkipChoice] = useState(false);
  const store = useTTSStore();
  const activeRef = useRef<HTMLElement>(null);
  const bgGenerating = useRef(false);

  const { data: textData, isLoading } = useQuery({
    queryKey: ["doc-text", docId], queryFn: () => documentsApi.getText(docId!), enabled: !!docId,
  });
  const { data: stats } = useQuery({
    queryKey: ["doc-stats", docId], queryFn: () => documentsApi.getStats(docId!), enabled: !!docId,
  });

  const contentStartOffset = textData?.content_start_offset || 0;
  const chaptersWithOffsets = textData?.chapters_with_offsets || [];

  // Show skip choice when content_start_offset > 0
  useEffect(() => {
    if (textData && contentStartOffset > 200) {
      setShowSkipChoice(true);
    }
  }, [textData, contentStartOffset]);

  // Initialize segments
  useEffect(() => {
    if (!docId || !textData || store.segments.length > 0) return;
    (async () => {
      try {
        const info = await ttsApi.getInfo(docId);
        store.setDocumentId(docId);
        store.setTotalChars(info.total_chars);
        let cumTime = 0;
        const segs: Segment[] = info.segments.map(s => {
          const seg: Segment = {
            index: s.index, ready: false, generating: false,
            audioUrl: null, duration: s.duration_seconds,
            charStart: s.char_start, charEnd: s.char_end,
            timeStart: cumTime, boundaries: [],
          };
          cumTime += s.duration_seconds;
          return seg;
        });
        store.setSegments(segs);
        store.setTotalDuration(cumTime);
        setGenProgress({ done: 0, total: segs.length });
        await generateSegment(docId, 0);
        startBackgroundGeneration(docId, segs.length);
      } catch (err) {
        toast.error("Failed to load TTS info");
      }
    })();
  }, [docId, textData]);

  const generateSegment = useCallback(async (id: string, index: number) => {
    store.updateSegment(index, { generating: true });
    try {
      const res = await ttsApi.generateSegment(id, index, store.voiceId, store.speed);
      store.updateSegment(index, {
        ready: true, generating: false,
        audioUrl: ttsApi.segmentAudioUrl(id, index),
        duration: res.duration_seconds,
        boundaries: res.word_boundaries,
      });
      recalcTimeline();
      setGenProgress(p => ({ ...p, done: p.done + 1 }));
      return true;
    } catch {
      store.updateSegment(index, { generating: false });
      return false;
    }
  }, [store.voiceId, store.speed]);

  const startBackgroundGeneration = useCallback(async (id: string, total: number) => {
    if (bgGenerating.current) return;
    bgGenerating.current = true;
    for (let i = 1; i < total; i++) {
      const seg = useTTSStore.getState().segments[i];
      if (seg?.ready) continue;
      await generateSegment(id, i);
      await new Promise(r => setTimeout(r, 200));
    }
    bgGenerating.current = false;
  }, [generateSegment]);

  // Handle seek to ungenerated segment
  useEffect(() => {
    const seg = store.segments[store.currentSegmentIndex];
    if (!seg || seg.ready || seg.generating || !docId) return;
    generateSegment(docId, seg.index);
  }, [store.currentSegmentIndex, store.segments, docId]);

  const recalcTimeline = () => {
    const segs = useTTSStore.getState().segments;
    let t = 0;
    for (const s of segs) { s.timeStart = t; t += s.duration; }
    store.setTotalDuration(t);
  };

  // Parse paragraphs
  const paragraphs = useMemo(() => {
    if (!textData?.clean_text) return [];
    const parts = textData.clean_text.split("\n\n").filter(p => p.trim());
    let offset = 0;
    return parts.map(text => {
      const p = { text: text.trim(), startOffset: offset, endOffset: offset + text.length };
      offset += text.length + 2;
      return p;
    });
  }, [textData?.clean_text]);

  // Active paragraph
  const activeIdx = useMemo(() => {
    const co = store.activeCharOffset;
    if (co < 0 || !paragraphs.length || !store.isPlaying) return -1;
    for (let i = 0; i < paragraphs.length; i++) {
      if (co >= paragraphs[i].startOffset && co < paragraphs[i].endOffset) return i;
    }
    if (store.totalDuration > 0 && store.totalChars > 0) {
      const est = Math.floor((store.currentTime / store.totalDuration) * store.totalChars);
      for (let i = 0; i < paragraphs.length; i++) {
        if (est >= paragraphs[i].startOffset && est < paragraphs[i].endOffset) return i;
      }
    }
    return -1;
  }, [store.activeCharOffset, store.isPlaying, store.currentTime, paragraphs]);

  // Auto-scroll
  useEffect(() => {
    if (activeIdx >= 0 && activeRef.current) {
      activeRef.current.scrollIntoView({ behavior: "smooth", block: "center" });
    }
  }, [activeIdx]);

  // Skip to main content
  const handleSkipToContent = () => {
    setShowSkipChoice(false);
    if (contentStartOffset > 0) {
      // Scroll text to content start
      setTimeout(() => {
        const paras = document.querySelectorAll("[data-offset]");
        for (const p of paras) {
          const off = parseInt(p.getAttribute("data-offset") || "0");
          if (off >= contentStartOffset) {
            p.scrollIntoView({ behavior: "smooth", block: "start" });
            break;
          }
        }
      }, 100);

      // Seek TTS audio to content start position
      if (store.totalDuration > 0 && store.totalChars > 0) {
        const seekTime = (contentStartOffset / store.totalChars) * store.totalDuration;
        // Find which segment this time falls in
        for (const seg of store.segments) {
          const end = seg.timeStart + seg.duration;
          if (seekTime >= seg.timeStart && seekTime < end) {
            store.setCurrentSegment(seg.index);
            store.setCurrentTime(seekTime);
            store.setPendingSeek(seekTime);  // Player will seek within segment
            if (!seg.ready) store.setLoading(true);
            break;
          }
        }
      }
    }
  };

  // Build a lookup for title/heading paragraphs from chapter data
  const titleOffsets = useMemo(() => {
    const map = new Map<number, { type: string; title: string }>();
    for (const ch of chaptersWithOffsets) {
      // Find which paragraph contains this chapter offset
      for (const p of paragraphs) {
        if (ch.char_offset >= p.startOffset && ch.char_offset < p.endOffset) {
          map.set(p.startOffset, { type: ch.type, title: ch.title });
          break;
        }
      }
    }
    return map;
  }, [chaptersWithOffsets, paragraphs]);
  if (isLoading) return <div className="reader-loading"><div className="loader" /><p>Loading document...</p></div>;
  if (!textData) return <div className="reader-loading"><p>Document not found</p><button className="btn btn--ghost" onClick={() => navigate("/")}>Back</button></div>;

  const isGenerating = genProgress.done < genProgress.total && genProgress.total > 0;

  return (
    <div className="reader">
      {/* Header */}
      <div className="reader__head">
        <button className="btn btn--icon" onClick={() => { store.reset(); navigate("/"); }}><ArrowLeft size={18} /></button>
        <div className="reader__title-wrap">
          <h2 className="reader__title">{textData.title}</h2>
          <span className="reader__meta">
            {textData.total_pages} pages , {textData.word_count.toLocaleString()} words ,
            Est. {Math.ceil(store.totalDuration / 60)} min listen
          </span>
        </div>
        <div className="reader__actions">
          <button className={`btn btn--chip ${showStats ? "btn--chip-on" : ""}`} onClick={() => setShowStats(!showStats)}>
            <BarChart3 size={13} /> Filter stats
          </button>
        </div>
      </div>

      {/* Skip to content choice */}
      <AnimatePresence>
        {showSkipChoice && (
          <motion.div className="skip-choice" initial={{ opacity: 0, y: -12 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, height: 0 }}>
            <p className="skip-choice__text">This book has front matter (copyright, TOC, etc). Where do you want to start?</p>
            <div className="skip-choice__btns">
              <button className="btn btn--ghost" onClick={() => setShowSkipChoice(false)}>
                <BookOpenCheck size={15} /> Read from the beginning
              </button>
              <button className="btn btn--accent" onClick={handleSkipToContent}>
                <SkipForward size={15} /> Skip to main content
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Stats */}
      <AnimatePresence>
        {showStats && stats && (
          <motion.div className="stats-bar" initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }} exit={{ height: 0, opacity: 0 }}>
            <div className="stats-bar__inner">
              {[
                { label: "Total blocks", val: stats.total_blocks_extracted, color: "" },
                { label: "Body kept", val: stats.body_blocks_kept, color: "var(--c-green)" },
                { label: "Headers", val: stats.headers_removed, color: "var(--c-amber)" },
                { label: "Footers", val: stats.footers_removed, color: "var(--c-amber)" },
                { label: "Page #s", val: stats.page_numbers_removed, color: "var(--c-coral)" },
                { label: "Watermarks", val: stats.watermarks_removed, color: "var(--c-red)" },
              ].map(s => (
                <div key={s.label} className="stat-item">
                  <span className="stat-item__val" style={s.color ? { color: s.color } : {}}>{s.val}</span>
                  <span className="stat-item__label">{s.label}</span>
                </div>
              ))}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Chapters */}
      {chaptersWithOffsets.length > 0 && (
        <div className="chapters">
          <button className="chapters__toggle" onClick={() => setShowChapters(!showChapters)}>
            <BookOpen size={13} /> {chaptersWithOffsets.length} chapters
            {showChapters ? <ChevronUp size={13} /> : <ChevronDown size={13} />}
          </button>
          <AnimatePresence>
            {showChapters && (
              <motion.div className="chapters__list" initial={{ height: 0 }} animate={{ height: "auto" }} exit={{ height: 0 }}>
                {chaptersWithOffsets.map((ch, i) => (
                  <button key={i} className="chapters__item" onClick={() => {
                    const el = document.querySelector(`[data-offset="${ch.char_offset}"]`);
                    if (el) el.scrollIntoView({ behavior: "smooth", block: "start" });
                  }}>
                    <span className="chapters__num">{i + 1}</span> {ch.label || ch.title}
                  </button>
                ))}
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      )}

      {/* Generation progress */}
      {isGenerating && (
        <motion.div className="gen-banner" initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }}>
          <Zap size={14} className="spin" />
          Generating audio: {genProgress.done}/{genProgress.total} segments
          <div className="gen-bar"><div className="gen-bar__fill" style={{ width: `${(genProgress.done / genProgress.total) * 100}%` }} /></div>
        </motion.div>
      )}

      {/* Reading area */}
      <div className="reader__body">
        <article className="prose">
          {paragraphs.map((para, i) => {
            const t = para.text;
            const isActive = i === activeIdx;
            const charOff = store.activeCharOffset;
            const word = store.activeWord;

            // Detect title/heading from chapter offset data (markers are stripped)
            const chapterInfo = titleOffsets.get(para.startOffset);
            const isTitle = chapterInfo?.type === "title";
            const isHeading = chapterInfo?.type === "heading";

            if (isTitle) {
              return (
                <h2 key={i} className="prose__title" data-offset={para.startOffset} ref={isActive ? activeRef : undefined}>
                  {t}
                </h2>
              );
            }

            if (isHeading) {
              return (
                <h3 key={i} className={`prose__heading ${isActive ? "prose--active" : ""}`}
                  data-offset={para.startOffset} ref={isActive ? activeRef : undefined}>
                  {t}
                </h3>
              );
            }

            // Word-level highlighting - uses char offset to find current word
            if (isActive && store.isPlaying && charOff >= para.startOffset && charOff < para.endOffset) {
              return (
                <p key={i} className="prose__para prose--active" data-offset={para.startOffset} ref={activeRef}>
                  <WordHighlightedText
                    text={t}
                    paraOffset={para.startOffset}
                    activeCharOffset={charOff}
                    activeWord={word}
                  />
                </p>
              );
            }

            return (
              <p key={i} className={`prose__para ${isActive ? "prose--active" : ""}`}
                data-offset={para.startOffset} ref={isActive ? activeRef : undefined}>
                {t}
              </p>
            );
          })}
        </article>
      </div>

      <TTSPlayer
        documentId={docId!}
        chapters={chaptersWithOffsets}
        totalChars={store.totalChars}
      />
    </div>
  );
}


// Word-level highlighting component
function WordHighlightedText({
  text, paraOffset, activeCharOffset, activeWord
}: {
  text: string; paraOffset: number; activeCharOffset: number; activeWord: string;
}) {
  const relativeOffset = activeCharOffset - paraOffset;

  // Clamp to valid range
  if (relativeOffset < 0 || relativeOffset >= text.length) return <>{text}</>;

  // Strategy 1: If we have the active word text, find it near the offset
  if (activeWord) {
    const searchStart = Math.max(0, relativeOffset - 30);
    const searchEnd = Math.min(text.length, relativeOffset + activeWord.length + 30);
    const region = text.substring(searchStart, searchEnd);
    const idx = region.toLowerCase().indexOf(activeWord.toLowerCase());
    if (idx >= 0) {
      const start = searchStart + idx;
      const end = start + activeWord.length;
      return (
        <>
          <span className="word--before">{text.substring(0, start)}</span>
          <span className="word--active">{text.substring(start, end)}</span>
          <span className="word--after">{text.substring(end)}</span>
        </>
      );
    }
  }

  // Strategy 2: Find the word at the char offset position
  // Walk backwards to find word start, forwards to find word end
  let wordStart = relativeOffset;
  let wordEnd = relativeOffset;

  // Find start of current word (go back until whitespace or start)
  while (wordStart > 0 && !/\s/.test(text[wordStart - 1])) wordStart--;

  // Find end of current word (go forward until whitespace or end)
  while (wordEnd < text.length && !/\s/.test(text[wordEnd])) wordEnd++;

  // Safety: if we found nothing meaningful, show unhighlighted
  if (wordEnd <= wordStart) return <>{text}</>;

  return (
    <>
      <span className="word--before">{text.substring(0, wordStart)}</span>
      <span className="word--active">{text.substring(wordStart, wordEnd)}</span>
      <span className="word--after">{text.substring(wordEnd)}</span>
    </>
  );
}
