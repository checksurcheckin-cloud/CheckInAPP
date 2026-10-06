// Design tokens partagés entre checkin-mobile, checkin-pos et web-manager,
// pour garder une cohérence visuelle malgré des stacks UI différentes
// (React Native vs React web).

// Palette bleue sobre — ton rassurant/professionnel adapté à un outil légal
// de pointage, pas une identité "startup". `accent` est un unique accent
// secondaire (teal) réservé à des touches de profondeur très ponctuelles
// (ex: glow derrière le QR de pointage) — ne remplace jamais `primary`.
export const colors = {
  primary: '#2563EB',
  primaryDark: '#1D4ED8',
  primaryTint: '#EFF6FF',
  accent: '#0D9488',
  accentTint: '#F0FDFA',
  success: '#16A34A',
  successTint: '#F0FDF4',
  warning: '#F59E0B',
  warningTint: '#FFFBEB',
  danger: '#DC2626',
  background: '#F9FAFB',
  surface: '#FFFFFF',
  textPrimary: '#111827',
  textSecondary: '#6B7280',
  border: '#E5E7EB',
};

// Palette pastel pour les cartes de shift de la grille planning (web-manager).
// Une couleur est choisie par shift (hash déterministe sur son id, voir
// `getShiftPalette` dans web-manager) — sert uniquement à distinguer
// visuellement des shifts voisins, pas à encoder un statut ou un rôle. 8
// teintes (élargi depuis 4) pour qu'une même cellule/jour avec plusieurs
// cartes ait moins de collisions de couleur — même famille de ton (fond
// très pâle + texte saturé mais sourd), aucune nouvelle teinte criarde.
export const shiftPalette = [
  { bg: '#FFF3E6', text: '#B45309' }, // orange
  { bg: '#EAF2FF', text: '#2563EB' }, // bleu
  { bg: '#FDF0F6', text: '#BE185D' }, // rose
  { bg: '#F3EEFF', text: '#7C3AED' }, // violet
  { bg: '#EAFBF0', text: '#15803D' }, // vert
  { bg: '#FFFBE6', text: '#A16207' }, // ambre
  { bg: '#E6FBFF', text: '#0E7490' }, // cyan
  { bg: '#EEF2FF', text: '#4338CA' }, // indigo
];

// Format CSS (web uniquement) — dégradé de marque, utilisé avec parcimonie
// (logo, CTA principal, accents) pour ne pas surcharger l'interface.
export const gradients = {
  brand: 'linear-gradient(135deg, #2563EB 0%, #1D4ED8 100%)',
  brandHover: 'linear-gradient(135deg, #1D4ED8 0%, #1E40AF 100%)',
};

// Format CSS (web uniquement — React Native ignore ces propriétés).
export const shadows = {
  sm: '0 1px 2px rgba(17, 24, 39, 0.06)',
  md: '0 4px 12px rgba(17, 24, 39, 0.08)',
  lg: '0 16px 32px rgba(17, 24, 39, 0.14)',
};

// Équivalent React Native (checkin-mobile, checkin-pos) — shadowColor/Offset/
// Opacity/Radius pour iOS, elevation pour Android, dans un seul objet
// directement spreadable dans un style RN.
export const nativeShadow = {
  sm: {
    shadowColor: '#111827',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.06,
    shadowRadius: 2,
    elevation: 1,
  },
  md: {
    shadowColor: '#111827',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.08,
    shadowRadius: 8,
    elevation: 3,
  },
  lg: {
    shadowColor: '#111827',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.16,
    shadowRadius: 16,
    elevation: 6,
  },
};

export const spacing = {
  xs: 4,
  sm: 8,
  md: 16,
  lg: 24,
  xl: 32,
};

export const radius = {
  sm: 6,
  md: 10,
  lg: 16,
  xl: 22,
  full: 9999,
};

export const typography = {
  fontFamily: 'System', // React Native — nécessiterait expo-font pour du custom
  // Web (web-manager) uniquement — chargées via Google Fonts dans index.html.
  // Sora pour les titres (plus de caractère), Inter pour le texte courant.
  fontFamilyDisplay: "'Sora', 'Segoe UI', system-ui, sans-serif",
  fontFamilyBody: "'Inter', 'Segoe UI', system-ui, sans-serif",
  sizes: {
    xs: 12,
    sm: 14,
    md: 16,
    lg: 20,
    xl: 28,
    '2xl': 36,
  },
};
