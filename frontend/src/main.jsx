import React from "react";
import ReactDOM from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter } from "react-router-dom";

import App from "./App";
import { ToastProvider } from "./components/Toast";
import "./styles/index.css";

const queryClient = new QueryClient({
  defaultOptions: {
    queries: { retry: 1, refetchOnWindowFocus: false },
  },
});

// PWA: service worker'ni faqat production'da ro'yxatdan o'tkazamiz.
// controllerchange => reload faqat "haqiqiy yangilanish" bo'lganda amalga
// oshadi (eski SW kontrolni yangi SW'ga uzatganda). Birinchi o'rnatishda
// (controller mavjud emas) reload qilmaymiz — aks holda PWA standalone
// birinchi ochilishda o'zini "otib yuborib" yangilanardi.
if (import.meta.env.PROD && "serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    const wasControlled = !!navigator.serviceWorker.controller;
    let refreshing = false;
    navigator.serviceWorker.addEventListener("controllerchange", () => {
      if (refreshing || !wasControlled) return;
      refreshing = true;
      // Yangi SW o'rnatilganini ko'rsatib, sahifani boshqarishni yangilaymiz.
      window.location.reload();
    });
    navigator.serviceWorker.register("/sw.js").catch(() => {});
  });
}

ReactDOM.createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <ToastProvider>
          <App />
        </ToastProvider>
      </BrowserRouter>
    </QueryClientProvider>
  </React.StrictMode>
);