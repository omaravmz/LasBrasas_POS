import "./pos.css";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./App.js";

// Tema (claro/oscuro): se aplica ANTES de renderizar para evitar el parpadeo. La
// preferencia vive en localStorage; el toggle del header la actualiza. Default: claro.
document.documentElement.dataset.theme =
  localStorage.getItem("pos-theme") === "dark" ? "dark" : "light";

const root = document.getElementById("root");
if (!root) throw new Error("No se encontró el elemento #root");

createRoot(root).render(
  <StrictMode>
    <App />
  </StrictMode>
);
