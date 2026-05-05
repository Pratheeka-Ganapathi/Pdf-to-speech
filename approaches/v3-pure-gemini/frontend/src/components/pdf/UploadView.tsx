import { useState, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { useDropzone } from "react-dropzone";
import { useMutation } from "@tanstack/react-query";
import { motion, AnimatePresence } from "framer-motion";
import { Upload, FileText, CheckCircle, AlertCircle, Loader2, Sparkles, Filter, Headphones, BookOpen, ArrowRight } from "lucide-react";
import toast from "react-hot-toast";
import { documentsApi, DocUploadRes } from "../../services/api";

type Stage = "idle" | "uploading" | "processing" | "done" | "error";

const STEPS = [
  { id: "upload", label: "Uploading PDF", icon: FileText },
  { id: "calibrate", label: "Gemini analyzing layout (4 pages)", icon: Filter },
  { id: "extract", label: "Gemini extracting clean text (batches)", icon: BookOpen },
  { id: "ready", label: "Preparing for narration", icon: Headphones },
];

export function UploadView() {
  const navigate = useNavigate();
  const [stage, setStage] = useState<Stage>("idle");
  const [step, setStep] = useState(0);
  const [result, setResult] = useState<DocUploadRes | null>(null);

  const mut = useMutation({
    mutationFn: documentsApi.upload,
    onMutate: () => {
      setStage("processing");
      setStep(0);
      // Animate steps progressively - Gemini takes ~2 min total
      setTimeout(() => setStep(1), 3000);    // After 3s: "analyzing layout"
      setTimeout(() => setStep(2), 8000);    // After 8s: "extracting text"
      // Step 3 shows when server responds (onSuccess)
    },
    onSuccess: (data) => {
      setResult(data);
      setStep(STEPS.length);
      setTimeout(() => { setStage("done"); toast.success(`Processed ${data.total_pages} pages with Gemini AI!`); }, 500);
    },
    onError: (e: any) => { setStage("error"); toast.error(e?.response?.data?.detail || "Upload failed"); },
  });

  const onDrop = useCallback((f: File[]) => {
    const file = f[0];
    if (!file) return;
    if (!file.name.toLowerCase().endsWith(".pdf")) { toast.error("PDF files only"); return; }
    if (file.size > 50 * 1024 * 1024) { toast.error("Max 50MB"); return; }
    setStep(0);
    mut.mutate(file);
  }, [mut]);

  const { getRootProps, getInputProps, isDragActive } = useDropzone({ onDrop, accept: { "application/pdf": [".pdf"] }, maxFiles: 1, disabled: stage === "processing" });

  return (
    <div className="upload">
      <div className="upload__head">
        <h2 className="page-title">Upload PDF</h2>
        <p className="page-sub">AI pipeline strips headers, footers, page numbers & watermarks automatically.</p>
      </div>

      <AnimatePresence mode="wait">
        {(stage === "idle" || stage === "error") && (
          <motion.div key="drop" initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -16 }}>
            <div {...getRootProps()} className={`dropzone ${isDragActive ? "dropzone--drag" : ""} ${stage === "error" ? "dropzone--err" : ""}`}>
              <input {...getInputProps()} />
              <div className="dropzone__inner">
                <div className="dropzone__icon">{stage === "error" ? <AlertCircle size={40} /> : <Upload size={40} />}</div>
                <h3>{isDragActive ? "Drop your PDF here" : stage === "error" ? "Upload failed - try again" : "Drag & drop your PDF"}</h3>
                <p>or click to browse (max 50MB)</p>
              </div>
            </div>
          </motion.div>
        )}

        {stage === "processing" && (
          <motion.div key="proc" className="proc-card" initial={{ opacity: 0, scale: 0.96 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.96 }}>
            <div className="proc-card__head"><Loader2 size={18} className="spin" /> Gemini AI processing</div>
            <div className="pipeline">
              {STEPS.map((s, i) => {
                const I = s.icon;
                const done = i < step, active = i === step;
                return (
                  <motion.div key={s.id} className={`pipeline__step ${done ? "pipeline__step--done" : active ? "pipeline__step--on" : ""}`}
                    animate={{ opacity: done || active ? 1 : 0.35 }}>
                    <div className="pipeline__icon">{done ? <CheckCircle size={16} /> : <I size={16} />}</div>
                    <span>{s.label}</span>
                  </motion.div>
                );
              })}
            </div>
          </motion.div>
        )}

        {stage === "done" && result && (
          <motion.div key="done" className="done-card" initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }}>
            <div className="done-card__icon"><Sparkles size={28} /></div>
            <h3>Processing Complete</h3>
            <p className="done-card__msg">{result.message}</p>
            <div className="done-card__stats">
              <div className="done-card__stat"><span className="done-card__val">{result.total_pages}</span><span>Pages</span></div>
              <div className="done-card__stat"><span className="done-card__val">{result.word_count.toLocaleString()}</span><span>Words</span></div>
              <div className="done-card__stat"><span className="done-card__val">{result.filtered_blocks_count}</span><span>Filtered</span></div>
            </div>
            <div className="done-card__actions">
              <button className="btn btn--accent btn--lg" onClick={() => navigate(`/read/${result.id}`)}><Headphones size={16} /> Start Reading <ArrowRight size={15} /></button>
              <button className="btn btn--ghost" onClick={() => { setStage("idle"); setResult(null); }}>Upload Another</button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
