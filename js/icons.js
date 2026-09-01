// Icon-Bank der Ablese-PWA — TEILMENGE der ICON_STRICHZUEGE aus der
// Mietverwaltung (frontend/js/core.js, Lucide ISC, lucide-static 1.38.0;
// Zuarbeit ICONS_LUCIDE_2026-08-31). Die Strichzuege sind 1:1 von dort
// uebernommen; aufgenommen wird nur, was hier einen Verbraucher hat (U1).
// Gezeichnet wird ausschliesslich ueber icSvg() in currentColor — kein
// Farbwert im Symbol, die Farbe kommt vom umgebenden Text (Token-Regel).
"use strict";

const ICON_STRICHZUEGE = {
  'arrow-up-right': '<path d="M7 7h10v10" /> <path d="M7 17 17 7" />',
  'camera': '<path d="M13.997 4a2 2 0 0 1 1.76 1.05l.486.9A2 2 0 0 0 18.003 7H20a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V9a2 2 0 0 1 2-2h1.997a2 2 0 0 0 1.759-1.048l.489-.904A2 2 0 0 1 10.004 4z" /> <circle cx="12" cy="13" r="3" />',
  'circle-check': '<circle cx="12" cy="12" r="10" /> <path d="m16 9-5.5 5.5L8 12" />',
  'clipboard-list': '<rect width="8" height="4" x="8" y="2" rx="1" ry="1" /> <path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2" /> <path d="M12 11h4" /> <path d="M12 16h4" /> <path d="M8 11h.01" /> <path d="M8 16h.01" />',
  'eye': '<path d="M2.062 12.348a1 1 0 0 1 0-.696 10.75 10.75 0 0 1 19.876 0 1 1 0 0 1 0 .696 10.75 10.75 0 0 1-19.876 0" /> <circle cx="12" cy="12" r="3" />',
  'triangle-alert': '<path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3" /> <path d="M12 9v4" /> <path d="M12 17h.01" />',
};

// EIN Zeichenweg — dieselbe Bauart wie icSvg() in der Mietverwaltung.
function icSvg(name) {
  return `<svg class="ic-svg" width="15" height="15" viewBox="0 0 24 24" fill="none"
    stroke="currentColor" stroke-width="1.6" stroke-linecap="round"
    stroke-linejoin="round" aria-hidden="true">${ICON_STRICHZUEGE[name] || ''}</svg>`;
}
