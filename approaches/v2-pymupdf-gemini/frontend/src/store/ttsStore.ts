import { create } from "zustand";

export interface Segment {
  index: number;
  ready: boolean;
  generating: boolean;
  audioUrl: string | null;
  duration: number;
  charStart: number;
  charEnd: number;
  timeStart: number;
  boundaries: { offset: number; text: string; time_ms: number }[];
}

interface TTSState {
  isPlaying: boolean;
  isLoading: boolean;
  currentTime: number;
  totalDuration: number;
  currentSegmentIndex: number;
  segmentTime: number;
  pendingSeekGlobal: number;  // -1 = none, else global seconds to seek to
  voiceId: string;
  speed: number;
  volume: number;
  documentId: string | null;
  totalChars: number;
  segments: Segment[];
  activeCharOffset: number;
  activeWord: string;

  setPlaying: (v: boolean) => void;
  setLoading: (v: boolean) => void;
  setCurrentTime: (t: number) => void;
  setSegmentTime: (t: number) => void;
  setTotalDuration: (d: number) => void;
  setCurrentSegment: (i: number) => void;
  setPendingSeek: (t: number) => void;
  setVoice: (v: string) => void;
  setSpeed: (s: number) => void;
  setVolume: (v: number) => void;
  setDocumentId: (id: string) => void;
  setTotalChars: (c: number) => void;
  setSegments: (s: Segment[]) => void;
  updateSegment: (index: number, updates: Partial<Segment>) => void;
  setActiveCharOffset: (o: number) => void;
  setActiveWord: (w: string) => void;
  reset: () => void;
}

const init = {
  isPlaying: false, isLoading: false, currentTime: 0, totalDuration: 0,
  currentSegmentIndex: 0, segmentTime: 0, pendingSeekGlobal: -1,
  voiceId: "en-US-AriaNeural", speed: 1.0, volume: 0.8,
  documentId: null as string | null, totalChars: 0,
  segments: [] as Segment[], activeCharOffset: -1, activeWord: "",
};

export const useTTSStore = create<TTSState>((set) => ({
  ...init,
  setPlaying: (v) => set({ isPlaying: v }),
  setLoading: (v) => set({ isLoading: v }),
  setCurrentTime: (t) => set({ currentTime: t }),
  setSegmentTime: (t) => set({ segmentTime: t }),
  setTotalDuration: (d) => set({ totalDuration: d }),
  setCurrentSegment: (i) => set({ currentSegmentIndex: i }),
  setPendingSeek: (t) => set({ pendingSeekGlobal: t }),
  setVoice: (v) => set({ voiceId: v }),
  setSpeed: (s) => set({ speed: s }),
  setVolume: (v) => set({ volume: v }),
  setDocumentId: (id) => set({ documentId: id }),
  setTotalChars: (c) => set({ totalChars: c }),
  setSegments: (s) => set({ segments: s }),
  updateSegment: (index, updates) => set((state) => ({
    segments: state.segments.map(s => s.index === index ? { ...s, ...updates } : s),
  })),
  setActiveCharOffset: (o) => set({ activeCharOffset: o }),
  setActiveWord: (w) => set({ activeWord: w }),
  reset: () => set(init),
}));
