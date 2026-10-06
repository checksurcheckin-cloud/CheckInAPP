// Extension locale des tokens partagés (@horaires/ui-tokens) — polices
// custom chargées uniquement dans checkin-mobile (voir App.tsx), donc pas
// mises dans le package partagé pour ne pas affecter checkin-pos/web-manager
// qui ne les chargent pas.
export const fonts = {
  display: 'Sora_700Bold',
  displaySemiBold: 'Sora_600SemiBold',
  body: 'Inter_400Regular',
  bodyMedium: 'Inter_500Medium',
  bodySemiBold: 'Inter_600SemiBold',
  bodyBold: 'Inter_700Bold',
};
