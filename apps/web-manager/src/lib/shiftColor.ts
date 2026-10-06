import { shiftPalette } from '@horaires/ui-tokens';
import type { Shift } from '@horaires/shared-types';

// Couleur mémorisée par shift (id -> index dans shiftPalette), persistée en
// localStorage — remplace l'ancien hash de l'id : un hash pouvait faire
// coïncider deux shifts du même jour sur la même teinte même avec peu de
// shifts ce jour-là (8 couleurs, hash uniforme => collision fréquente à
// petit nombre). Ici, une fois assignée, la couleur d'un shift ne change
// plus JAMAIS (même s'il change de jour ensuite) — "garder sa couleur"
// prime sur "rester sans collision pour toujours", qui de toute façon
// deviendrait impossible avec 8 teintes une fois qu'il existe plus de 8
// shifts au total dans l'historique.
const STORAGE_KEY = 'horaires:shift-colors';

function loadColorMap(): Record<string, number> {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    const parsed = raw ? JSON.parse(raw) : null;
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return {};
  }
}

function saveColorMap(map: Record<string, number>): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(map));
  } catch {
    // Stockage plein ou bloqué (navigation privée) — la couleur reste
    // utilisable pour la session en cours, juste pas mémorisée.
  }
}

// Enregistre directement la couleur d'un modèle sur le shift qui vient d'en
// être créé (voir PlanningPage.placeTemplate) — un shift déposé depuis la
// bibliothèque de modèles garde la couleur de CE modèle, plutôt que de s'en
// voir attribuer une autre au prochain calcul de resolveShiftColors.
export function assignInheritedShiftColor(shiftId: string, paletteIndex: number): void {
  const map = loadColorMap();
  map[shiftId] = paletteIndex;
  saveColorMap(map);
}

// Calcule la couleur de chaque shift actuellement chargé, en réutilisant les
// assignations déjà mémorisées et en n'en créant de nouvelles que pour les
// shifts jamais vus — sans collision avec un AUTRE shift du même jour tant
// qu'il reste une teinte libre parmi les 8 de shiftPalette.
export function resolveShiftColors(shifts: Shift[]): Map<string, { bg: string; text: string }> {
  const map = loadColorMap();
  let dirty = false;

  const byDay = new Map<string, Shift[]>();
  for (const shift of shifts) {
    const key = new Date(shift.startsAt).toDateString();
    const list = byDay.get(key);
    if (list) list.push(shift);
    else byDay.set(key, [shift]);
  }

  for (const dayShifts of byDay.values()) {
    const usedThisDay = new Set<number>();
    for (const shift of dayShifts) {
      if (map[shift.id] !== undefined) usedThisDay.add(map[shift.id]);
    }
    for (const shift of dayShifts) {
      if (map[shift.id] !== undefined) continue;
      let index = 0;
      while (usedThisDay.has(index) && index < shiftPalette.length - 1) index++;
      map[shift.id] = index;
      usedThisDay.add(index);
      dirty = true;
    }
  }

  if (dirty) saveColorMap(map);

  const result = new Map<string, { bg: string; text: string }>();
  for (const shift of shifts) {
    result.set(shift.id, shiftPalette[map[shift.id] % shiftPalette.length]);
  }
  return result;
}
