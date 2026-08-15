import { StrictMode } from "react";
import { createRoot } from "react-dom/client";

import "../app/globals.css";
import { WindExperience } from "@/components/WindExperience";

const container = document.getElementById("root");

if (!container) {
  throw new Error("No se encontró el contenedor principal de la aplicación.");
}

createRoot(container).render(
  <StrictMode>
    <WindExperience />
  </StrictMode>,
);
