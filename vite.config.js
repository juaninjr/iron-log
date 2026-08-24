import { defineConfig } from "vite";

// No framework plugin needed — this is plain HTML/CSS/JS with ES modules,
// split across src/ for organization. Vite's defaults (index.html at the
// project root as the entry point, public/ copied as-is into the build)
// are exactly what this project needs.
export default defineConfig({});
