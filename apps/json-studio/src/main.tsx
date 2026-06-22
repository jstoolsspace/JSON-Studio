import React from "react";
import ReactDOM from "react-dom/client";
import { App } from "./App";
import { applySettings, useSettings } from "./stores/settings";
import "./styles/app.css";

// Apply defaults immediately, then load persisted settings and re-apply.
applySettings(useSettings.getState());
void useSettings.getState().load();

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
