import { colors } from '@horaires/ui-tokens';

// Curseur rond en SVG inline pour les poignées de glisser-déposer — remplace
// la main par défaut du navigateur (cursor: grab/grabbing).
function circleCursor(radius: number, fill: string, size: number): string {
  const center = size / 2;
  const svg = `<svg xmlns='http://www.w3.org/2000/svg' width='${size}' height='${size}'><circle cx='${center}' cy='${center}' r='${radius}' fill='${fill}' fill-opacity='0.85' stroke='white' stroke-width='2'/></svg>`;
  const encoded = encodeURIComponent(svg);
  return `url("data:image/svg+xml,${encoded}") ${center} ${center}`;
}

export const DRAG_CURSOR = `${circleCursor(9, colors.primary, 22)}, grab`;
export const DRAG_CURSOR_ACTIVE = `${circleCursor(7, colors.primaryDark, 18)}, grabbing`;
