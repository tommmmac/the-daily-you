import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter, Navigate, Route, Routes } from "react-router";
import "@fontsource/old-standard-tt/400.css";
import "@fontsource/old-standard-tt/400-italic.css";
import "@fontsource/old-standard-tt/700.css";
import "@fontsource-variable/source-serif-4/wght.css";
import "@fontsource-variable/source-serif-4/wght-italic.css";
import { Layout } from "@/components/layout";
import { SettingsProvider } from "@/lib/settings";
import { ChatPage } from "@/pages/chat";
import { EntryPage } from "@/pages/entry";
import { JournalPage } from "@/pages/journal";
import { SettingsPage } from "@/pages/settings";
import "./index.css";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <SettingsProvider>
      <BrowserRouter>
        <Routes>
          <Route element={<Layout />}>
            <Route index element={<Navigate to="/chat" replace />} />
            <Route path="chat" element={<ChatPage />} />
            <Route path="journal" element={<JournalPage />} />
            <Route path="journal/:date" element={<EntryPage />} />
            <Route path="settings" element={<SettingsPage />} />
          </Route>
        </Routes>
      </BrowserRouter>
    </SettingsProvider>
  </StrictMode>,
);
