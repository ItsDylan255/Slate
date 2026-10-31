import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import "./index.css";

async function start() {
  // Im normalen Browser (ohne Tauri) eine Test-Datenbank verwenden – nur während der Entwicklung
  if (import.meta.env.DEV && !("__TAURI_INTERNALS__" in window)) {
    const { installMock } = await import("./dev/mockTauri");
    await installMock();
    const { useStore } = await import("./store");
    (window as never as { __store: typeof useStore }).__store = useStore;
    // Beispieldaten für Screenshots (?demo)
    const params = new URLSearchParams(location.search);
    if (params.has("demo")) import("./dev/demo").then((m) => m.runDemo(params));
  }
  ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
    <React.StrictMode>
      <App />
    </React.StrictMode>,
  );
}

start();
