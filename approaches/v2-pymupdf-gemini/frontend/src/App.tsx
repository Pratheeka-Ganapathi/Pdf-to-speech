import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { Toaster } from "react-hot-toast";
import { AppLayout } from "./components/layout/AppLayout";
import { Dashboard } from "./components/layout/Dashboard";
import { ReaderView } from "./components/pdf/ReaderView";
import { UploadView } from "./components/pdf/UploadView";

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 5 * 60 * 1000,
      retry: 2,
    },
  },
});

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <Routes>
          <Route element={<AppLayout />}>
            <Route path="/" element={<Dashboard />} />
            <Route path="/upload" element={<UploadView />} />
            <Route path="/read/:docId" element={<ReaderView />} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Route>
        </Routes>
      </BrowserRouter>
      <Toaster
        position="bottom-right"
        toastOptions={{
          style: {
            background: "var(--bg-2)",
            color: "var(--tx-1)",
            borderRadius: "10px",
            fontSize: "13px",
            border: "1px solid var(--bd-1)",
          },
        }}
      />
    </QueryClientProvider>
  );
}
