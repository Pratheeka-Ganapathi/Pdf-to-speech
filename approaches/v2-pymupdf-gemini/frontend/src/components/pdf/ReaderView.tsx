import { useState, useRef, useEffect, useMemo, useCallback } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { motion, AnimatePresence } from "framer-motion";
import { ArrowLeft, BookOpen, BarChart3, ChevronDown, ChevronUp, Zap, SkipForward } from "lucide-react";
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
  const [autoSeeked, setAutoSeeked] = useState(false);
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

        // Find which segment contains the content start
        let startSegIdx = 0;
        if (contentStartOffset > 0) {
          for (const seg of segs) {
            if (contentStartOffset >= seg.charStart && contentStartOffset < seg.charEnd) {
              startSegIdx = seg.index;
              break;
            }
          }
        }

        // Generate the content-start segment first (might not be segment 0)
        await generateSegment(docId, startSegIdx);

        // If content starts in a later segment, also generate segment 0 for completeness
        if (startSegIdx > 0) {
          generateSegment(docId, 0);
        }

        startBackgroundGeneration(docId, segs.length);
      } catch (err) {
        toast.error("Failed to load TTS info");
      }
    })();
  }, [docId, textData]);

  // Auto-seek to content start once segments are ready
  useEffect(() => {
    if (autoSeeked || !textData || contentStartOffset <= 0) return;
    if (store.segments.length === 0) return;

    // Find the segment containing content start
    for (const seg of store.segments) {
      if (contentStartOffset >= seg.charStart && contentStartOffset < seg.charEnd) {
        if (!seg.ready) return; // Wait until it's generated

        // Seek TTS to content start
        const segPct = (contentStartOffset - seg.charStart) / (seg.charEnd - seg.charStart);
        const seekTime = seg.timeStart + (segPct * seg.duration);
        store.setCurrentSegment(seg.index);
        store.setCurrentTime(seekTime);
        store.setPendingSeek(seekTime);

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
        }, 300);

        setAutoSeeked(true);
        break;
      }
    }
  }, [store.segments, autoSeeked, contentStartOffset, textData]);

  const generateSegment = useCallback(async (id: string, index: number) => {
    const current = useTTSStore.getState().segments[index];
    if (current?.ready || current?.generating) return true;
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
    for (let i = 0; i < total; i++) {
      const seg = useTTSStore.getState().segments[i];
      if (seg?.ready) continue;
      await generateSegment(id, i);
      await new Promise(r => setTimeout(r, 200));
    }
    bgGenerating.current = false;
  }, [generateSegment]);

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
    return -1;
  }, [store.activeCharOffset, store.isPlaying, paragraphs]);

  useEffect(() => {
    if (activeIdx >= 0 && activeRef.current) {
      activeRef.current.scrollIntoView({ behavior: "smooth", block: "center" });
    }
  }, [activeIdx]);

  // Title/heading lookup
  const titleOffsets = useMemo(() => {
    const map = new Map<number, { type: string; title: string }>();
    for (const ch of chaptersWithOffsets) {
      for (const p of paragraphs) {
        if (ch.char_offset >= p.startOffset && ch.char_offset < p.endOffset) {
          const paraText = p.text.toLowerCase().trim();
          const chTitle = ch.title.toLowerCase().trim();
          if (p.text.length < 100 && (paraText.includes(chTitle) || chTitle.includes(paraText))) {
            map.set(p.startOffset, { type: ch.type, title: ch.title });
          }
          break;
        }
      }
    }
    return map;
  }, [chaptersWithOffsets, paragraphs]);

  // Detect paragraph type
  const getParaType = (text: string): "bullet" | "numbered" | "dash" | "body" => {
    const trimmed = text.trimStart();
    if (/^[•\u00b7∙▪▸►]/.test(trimmed)) return "bullet";
    if (/^[\-\u2014\u2013]\s/.test(trimmed)) return "dash";
    if (/^\d{1,3}[.)]\s/.test(trimmed)) return "numbered";
    return "body";
  };

  // Render
  if (isLoading) return <div className="reader-loading"><div className="loader" /><p>Loading document...</p></div>;
  if (!textData) return <div className="reader-loading"><p>Document not found</p><button className="btn btn--ghost" onClick={() => navigate("/")}>Back</button></div>;

  const isGenerating = genProgress.done < genProgress.total && genProgress.total > 0;

  // Find which chapter the content start points to (for button label)
  const contentStartChapter = chaptersWithOffsets.find(ch =>
    Math.abs(ch.char_offset - contentStartOffset) < 100
  );
  const skipLabel = contentStartChapter
    ? `Skip to "${contentStartChapter.title}"`
    : "Skip to main content";

  const handleSkipToContent = () => {
    if (contentStartOffset <= 0) return;

    // Find segment containing content start and seek TTS there
    for (const seg of store.segments) {
      if (contentStartOffset >= seg.charStart && contentStartOffset < seg.charEnd) {
        const segPct = (contentStartOffset - seg.charStart) / (seg.charEnd - seg.charStart);
        const seekTime = seg.timeStart + (segPct * seg.duration);
        store.setCurrentSegment(seg.index);
        store.setCurrentTime(seekTime);
        store.setPendingSeek(seekTime);
        if (!seg.ready) store.setLoading(true);
        break;
      }
    }

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
    }, 200);

    setAutoSeeked(true);
  };

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
          {contentStartOffset > 0 && !autoSeeked && (
            <button className="btn btn--accent" onClick={handleSkipToContent}>
              <SkipForward size={14} /> {skipLabel}
            </button>
          )}
          <button className={`btn btn--chip ${showStats ? "btn--chip-on" : ""}`} onClick={() => setShowStats(!showStats)}>
            <BarChart3 size={13} /> Filter stats
          </button>
        </div>
      </div>

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

            // Title/heading from TOC
            const chapterInfo = titleOffsets.get(para.startOffset);
            const isTitle = chapterInfo?.type === "title";
            const isHeading = chapterInfo?.type === "heading";

            if (isTitle) {
              return (
                <h2 key={i} className={`prose__title ${isActive ? "prose--active" : ""}`}
                  data-offset={para.startOffset} ref={isActive ? activeRef : undefined}>
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

            // Detect list formatting
            const paraType = getParaType(t);

            // Sentence highlighting for active paragraph
            if (isActive && store.isPlaying && charOff >= para.startOffset && charOff < para.endOffset) {
              const cls = paraType === "body" ? "prose__para" : "prose__list";
              return (
                <p key={i} className={`${cls} prose--active`} data-offset={para.startOffset} ref={activeRef}>
                  <SentenceHighlight text={t} paraOffset={para.startOffset} activeCharOffset={charOff} />
                </p>
              );
            }

            // List items
            if (paraType === "bullet" || paraType === "dash") {
              return (
                <div key={i} className={`prose__list-item ${isActive ? "prose--active" : ""}`}
                  data-offset={para.startOffset} ref={isActive ? activeRef : undefined}>
                  <span className="prose__bullet">{paraType === "bullet" ? "•" : "-"}</span>
                  <span>{t.replace(/^[•·∙▪▸►\-\u2014\u2013]\s*/, "")}</span>
                </div>
              );
            }

            if (paraType === "numbered") {
              const match = t.match(/^(\d{1,3}[.)]\s*)(.*)/s);
              return (
                <div key={i} className={`prose__list-item ${isActive ? "prose--active" : ""}`}
                  data-offset={para.startOffset} ref={isActive ? activeRef : undefined}>
                  <span className="prose__num">{match?.[1] || ""}</span>
                  <span>{match?.[2] || t}</span>
                </div>
              );
            }

            // Regular paragraph
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


// Sentence highlighting
function SentenceHighlight({
  text, paraOffset, activeCharOffset
}: {
  text: string; paraOffset: number; activeCharOffset: number;
}) {
  const relativeOffset = activeCharOffset - paraOffset;
  if (relativeOffset < 0 || relativeOffset >= text.length) return <>{text}</>;

  // Find sentence boundaries
  let sentenceStart = 0;
  let sentenceEnd = text.length;

  for (let i = relativeOffset - 1; i >= 0; i--) {
    if (".!?".includes(text[i])) {
      sentenceStart = i + 1;
      while (sentenceStart < text.length && /\s/.test(text[sentenceStart])) sentenceStart++;
      break;
    }
  }

  for (let i = relativeOffset; i < text.length; i++) {
    if (".!?".includes(text[i])) {
      sentenceEnd = i + 1;
      break;
    }
  }

  if (sentenceEnd <= sentenceStart) return <>{text}</>;

  return (
    <>
      <span className="sent--before">{text.substring(0, sentenceStart)}</span>
      <span className="sent--active">{text.substring(sentenceStart, sentenceEnd)}</span>
      <span className="sent--after">{text.substring(sentenceEnd)}</span>
    </>
  );
}
