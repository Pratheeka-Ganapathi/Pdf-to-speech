import { useQuery } from "@tanstack/react-query";
import { useNavigate, Link } from "react-router-dom";
import { motion } from "framer-motion";
import { FileText, Clock, Headphones, Filter, Upload, ChevronRight, Sparkles } from "lucide-react";
import { documentsApi, DocRes } from "../../services/api";

export function Dashboard() {
  const navigate = useNavigate();
  const { data, isLoading } = useQuery({ queryKey: ["docs"], queryFn: documentsApi.list });
  const docs = data?.documents ?? [];

  return (
    <div className="dash">
      <div className="dash__head">
        <div>
          <h2 className="page-title">Your Library</h2>
          <p className="page-sub">Upload PDFs and listen with AI-powered narration</p>
        </div>
        <Link to="/upload" className="btn btn--accent"><Upload size={15} /> Upload PDF</Link>
      </div>

      {isLoading ? (
        <div className="skel-grid">{[1,2,3].map(i => <div key={i} className="skel-card" />)}</div>
      ) : docs.length === 0 ? (
        <motion.div className="empty" initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.15 }}>
          <div className="empty__icon"><Sparkles size={36} /></div>
          <h3>No documents yet</h3>
          <p>Upload your first PDF to experience AI-powered reading with smart content extraction and natural text-to-speech.</p>
          <Link to="/upload" className="btn btn--accent btn--lg"><Upload size={17} /> Upload your first PDF</Link>
        </motion.div>
      ) : (
        <motion.div className="doc-grid" initial="hidden" animate="show" variants={{ show: { transition: { staggerChildren: 0.05 } } }}>
          {docs.map(d => <DocCard key={d.id} doc={d} onClick={() => navigate(`/read/${d.id}`)} />)}
        </motion.div>
      )}
    </div>
  );
}

function DocCard({ doc, onClick }: { doc: DocRes; onClick: () => void }) {
  return (
    <motion.button className="doc-card" onClick={onClick}
      variants={{ hidden: { opacity: 0, y: 16 }, show: { opacity: 1, y: 0 } }}
      whileHover={{ y: -3 }} whileTap={{ scale: 0.98 }}>
      <div className="doc-card__icon"><FileText size={24} /></div>
      <div className="doc-card__body">
        <h3 className="doc-card__title">{doc.title}</h3>
        <span className="doc-card__file">{doc.original_filename}</span>
        <div className="doc-card__meta">
          <span><FileText size={11} /> {doc.total_pages} pages</span>
          <span><Clock size={11} /> {doc.estimated_read_time} min</span>
          {doc.has_audio && <span className="doc-card__audio"><Headphones size={11} /> Audio ready</span>}
        </div>
        <div className="doc-card__stats">
          <span><Filter size={10} /> {doc.filtered_blocks_count} filtered</span>
          <span>{doc.word_count.toLocaleString()} words</span>
        </div>
      </div>
      <ChevronRight size={15} className="doc-card__arrow" />
    </motion.button>
  );
}
