import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter, Navigate, Route, Routes } from "react-router";
import { Layout } from "@/components/layout";
import { ChatPage } from "@/pages/chat";
import { JournalPage } from "@/pages/journal";
import "./index.css";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <BrowserRouter>
      <Routes>
        <Route element={<Layout />}>
          <Route index element={<Navigate to="/chat" replace />} />
          <Route path="chat" element={<ChatPage />} />
          <Route path="journal" element={<JournalPage />} />
        </Route>
      </Routes>
    </BrowserRouter>
  </StrictMode>,
);
