# `AGENT_README.md`

> **HexaData Spec Editor** — Enterprise-grade 1:1 ISO 32000 vector PDF specification sheet editor and compiler.

---

## 1. System Architecture & Monorepo Layout

```
hexadata-spec-editor/
├── shared/           # Common data structures & default document state
│   ├── index.js      # Exports defaultDocumentState
│   └── package.json
├── backend/          # Express + Puppeteer PDF compilation server
│   ├── server.js     # ISO 32000 PDF generator endpoint (:3001/export)
│   └── package.json
├── frontend/         # Vite + React + Tailwind CSS client UI
│   ├── src/
│   │   ├── App.jsx   # Core A4 canvas, Zustand store, Liquid Glass Dock
│   │   ├── index.css # Custom glassmorphism utilities & scrollbars
│   │   └── main.jsx
│   ├── index.html    # Preloaded Google Fonts & viewport config
│   ├── tailwind.config.js # Extended brand colors & glass shadows
│   └── vite.config.js
└── package.json      # Workspace root
```

---

## 2. Brand Design System & Constraints

### Brand Palette (Strict Hex Codes)
* **Brand Cyan (`#009bb6`)**: Primary headers, bottom bar, tabs, accent lines.
* **Brand Deep Blue (`#046aa7`)**: Main titles and section headings.
* **Brand Black (`#121E36`)**: Primary body text and table cell text.
* **Brand White (`#F8FAFC`)**: Table header backgrounds and tab text.
* **Brand Grey (`#A3B1C6`)**: Table borders and footer secondary text.
* **Brand Link Blue (`#040F49`)**: OS Compatibility values and highlighted links.

### Typography Hierarchy
* **Display (`font-display`)**: `Space Grotesk` (Headings, Header title, Tab headers)
* **Body (`font-body`)**: `Inter Tight` (Body text, Tables, Footers)
* **Mono (`font-mono`)**: `JetBrains Mono` (Badges, Status indicators, Shortcodes)

### UI/UX Aesthetic
* **Theme**: *Acrobat Studio × macOS 27 Golden Gate Liquid Glass*.
* **Dock**: Right-aligned vertical floating dock (`glass-dock`), frosted backdrop blur (`backdrop-blur-3xl`), specular highlights, icon-only actions with hover tooltips.
* **Canvas**: Strict 1:1 A4 viewport (`210mm x 297mm`) with realistic paper elevation shadows (`shadow-paper-a4`).

---

## 3. Development Commands

### Installation
```bash
# Install root dependencies
npm install

# Install workspace dependencies
cd shared && npm install
cd ../backend && npm install
cd ../frontend && npm install
```

### Execution
```bash
# Start Backend Server (Runs on [http://127.0.0.1:3001](http://127.0.0.1:3001))
cd backend
npm run dev # or node server.js

# Start Frontend Client (Runs on http://localhost:5173)
cd frontend
npm run dev
```

---

## 4. Invariant Technical Specifications

### A. Rich Text Editable Engine (`App.jsx`)
* Uses `contentEditable` with `innerHTML` persistence (`dangerouslySetInnerHTML`).
* **DO NOT** convert `innerHTML` to `innerText` on blur; saving raw text strips formatting tags (`<b>`, `<i>`, `<u>`) used in PDF export.
* Cursor jump protection: sync `useEffect` checks `contentEditableRef.current.innerHTML !== value` before state update.

### B. Zero-Gap Slanted Tab Geometry
* Rendered via CSS clip-path: `clip-path: polygon(0 0, calc(100% - 4mm) 0, 100% 100%, 0 100%)`.
* **Sub-pixel Gap Fix**: The horizontal cyan rule MUST use negative margin `-ml-[2mm]` with `z-index` layering beneath the tab polygon to prevent sub-pixel gaps across DPI scales.

### C. Ghost UI Controls (Add / Delete Items)
* Item management controls (`+ Add Row`, `× Delete Row`) MUST be wrapped in `group/table` or `group/row` relative parents with absolute positioning.
* Default state: `opacity-0`; Hover state: `group-hover:opacity-100`.
* Controls MUST exist only in the React DOM and MUST NOT break A4 layout flow or leak into the Puppeteer PDF output.

### D. Puppeteer Vector PDF Engine (`server.js`)
* Configured with `--font-render-hinting=medium`, `printBackground: true`, and `preferCSSPageSize: true`.
* Single-page A4 lock enforced via `@page { size: A4; margin: 0; }`.
* Document metadata (Title, Author, Subject, Creator) injected in `<head>` for ISO 32000 & Adobe Acrobat Reader compatibility.

---

## 5. Non-Negotiable Agent Rules

1. **Zero Code Truncation**: Always output or update complete files when modifying repository code. Never use placeholder comments like `// ... rest of code`.
2. **Zero Layout Regressions**: Never alter document padding (`px-[12mm]`), header height (`14mm`), or footer positioning (`bottom-[8mm]`).
3. **Preserve State Contract**: Never modify the keys inside `@hexadata/shared`'s `defaultDocumentState` without updating both `App.jsx` and `server.js` simultaneously.
4. **Maintain Color Mapping**: Always use exact brand hex values or mapped Tailwind variables (`brand-cyan`, `brand-blue`, etc.).
5. **CORS & Port Constraints**: Backend MUST remain bound to `127.0.0.1:3001` for local PDF generation parity.