import axios from "axios";

const API_URL = import.meta.env.VITE_API_URL || "http://localhost:8000/api/v1";
const api = axios.create({ baseURL: API_URL, timeout: 600_000 }); // 10 min for Gemini batch processing

// Types
export interface DocUploadRes {
  id: string; title: string; original_filename: string; status: string;
  total_pages: number; word_count: number; estimated_read_time: number;
  filtered_blocks_count: number; body_blocks_count: number; message: string;
}
export interface DocRes {
  id: string; title: string; original_filename: string; status: string;
  total_pages: number; word_count: number; estimated_read_time: number;
  chapters: { page: number; title: string }[];
  filtered_blocks_count: number; body_blocks_count: number;
  has_audio: boolean; created_at: string;
}
export interface DocTextRes {
  document_id: string; title: string; clean_text: string;
  total_pages: number; word_count: number; chapters: { page: number; title: string }[];
  content_start_offset: number;
  chapters_with_offsets: { title: string; label: string; char_offset: number; type: string }[];
}
export interface FilterStats {
  total_blocks_extracted: number; body_blocks_kept: number;
  headers_removed: number; footers_removed: number;
  page_numbers_removed: number; watermarks_removed: number;
}
export interface TTSVoice { id: string; name: string; lang: string; gender: string; style: string; }

export interface SegmentInfo {
  index: number; ready: boolean; duration_seconds: number;
  char_start: number; char_end: number;
}
export interface TTSInfo {
  document_id: string; total_segments: number; total_chars: number;
  estimated_total_duration: number; segments: SegmentInfo[];
}
export interface SegmentGenRes {
  document_id: string; segment_index: number; status: string;
  audio_url: string; duration_seconds: number; synthesis_time: number;
  word_boundaries: { offset: number; text: string; time_ms: number }[];
}

// API
export const documentsApi = {
  upload: async (f: File): Promise<DocUploadRes> => {
    const fd = new FormData(); fd.append("file", f);
    return (await api.post("/documents/upload", fd, { headers: { "Content-Type": "multipart/form-data" } })).data;
  },
  list: async () => (await api.get("/documents")).data as { documents: DocRes[]; total: number },
  get: async (id: string): Promise<DocRes> => (await api.get(`/documents/${id}`)).data,
  getText: async (id: string): Promise<DocTextRes> => (await api.get(`/documents/${id}/text`)).data,
  getStats: async (id: string): Promise<FilterStats> => (await api.get(`/documents/${id}/stats`)).data,
};

export const ttsApi = {
  getInfo: async (docId: string): Promise<TTSInfo> =>
    (await api.get(`/documents/${docId}/tts/info`)).data,

  generateSegment: async (docId: string, index: number, voiceId = "af_heart", speed = 1.0): Promise<SegmentGenRes> =>
    (await api.post(`/documents/${docId}/tts/segment/${index}`, { voice_id: voiceId, speed })).data,

  segmentAudioUrl: (docId: string, index: number) =>
    `${API_URL}/documents/${docId}/tts/segment/${index}/audio`,

  getVoices: async (): Promise<TTSVoice[]> => (await api.get("/tts/voices")).data.voices,
};

export default api;
