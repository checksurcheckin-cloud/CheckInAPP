import { shiftPalette } from '@horaires/ui-tokens';

// Modèles de shift réutilisables ("16h-20h", "10h-18h") : un concept purement
// local à web-manager, jamais envoyé au backend tel quel — le `Shift` Prisma
// exige une date (voir CLAUDE.md). Un modèle ne devient un vrai shift qu'au
// moment où on le glisse sur une cellule de la grille (PlanningPage.placeTemplate),
// qui lui donne sa date. Persisté en local pour survivre à un rechargement,
// partagé entre sites : rien n'oblige un modèle d'horaire à un seul site.
export type ShiftTemplate = {
  id: string;
  startTime: string; // "HH:mm"
  endTime: string; // "HH:mm"
  roleNeeded?: string;
  // Index dans `shiftPalette`, attribué une fois à la création (voir
  // nextAvailablePaletteIndex) — jamais recalculé à partir de l'id ou de la
  // position dans le tableau, pour deux raisons : (1) stable même quand un
  // autre modèle est supprimé (pas de décalage de couleur en cascade), (2)
  // garanti sans collision avec un modèle existant tant qu'il reste une
  // teinte libre (contrairement à un hash, qui peut faire coïncider deux ids
  // sur la même teinte même avec peu de modèles).
  paletteIndex: number;
};

const STORAGE_KEY = 'horaires:shift-templates';

// Plus petit index de `shiftPalette` non utilisé par un modèle existant —
// recycle la teinte d'un modèle supprimé plutôt que de tourner en rond sur
// les mêmes premières teintes. Au-delà de shiftPalette.length modèles
// simultanés, une répétition devient inévitable (nombre de teintes fini).
export function nextAvailablePaletteIndex(templates: ShiftTemplate[]): number {
  const used = new Set(templates.map((t) => t.paletteIndex));
  for (let i = 0; i < shiftPalette.length; i++) {
    if (!used.has(i)) return i;
  }
  return templates.length % shiftPalette.length;
}

export function loadShiftTemplates(): ShiftTemplate[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    if (!Array.isArray(parsed)) return [];
    // Rétrocompatibilité : des modèles sauvegardés avant l'ajout de
    // paletteIndex n'en ont pas — on les complète dans l'ordre existant sans
    // toucher à ceux qui en ont déjà un.
    const withIndex: ShiftTemplate[] = [];
    for (const t of parsed) {
      withIndex.push(
        typeof t.paletteIndex === 'number' ? t : { ...t, paletteIndex: nextAvailablePaletteIndex(withIndex) },
      );
    }
    return withIndex;
  } catch {
    return [];
  }
}

export function saveShiftTemplates(templates: ShiftTemplate[]): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(templates));
  } catch {
    // Stockage plein ou bloqué (navigation privée) — les modèles restent
    // utilisables pour la session en cours, juste pas persistés.
  }
}
