import { initSentry } from "./shared/sentry";
initSentry();

import React from "react";
import ReactDOM from "react-dom/client";
import "@/index.css";
import App from "@/App";

// Suppress benign ResizeObserver errors
const resizeObserverLoopErr =
  "ResizeObserver loop completed with undelivered notifications";
window.addEventListener("error", (e) => {
  if (e.message.includes(resizeObserverLoopErr)) {
    e.stopImmediatePropagation();
  }
});

const root = ReactDOM.createRoot(document.getElementById("root"));
root.render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
