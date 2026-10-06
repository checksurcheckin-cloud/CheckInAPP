import type { StyleProp, ViewStyle } from 'react-native';

// Aucun Pressable de l'app n'avait de retour visuel à l'appui (style
// statique) — ce helper compose n'importe quel style existant avec un léger
// effet d'enfoncement (opacité + échelle), sans devoir définir une variante
// "Pressed" par bouton. Utile ici en particulier : le kiosk est manipulé au
// doigt sans curseur, la confirmation tactile immédiate compte plus qu'ailleurs.
export function withPressedFeedback(
  ...baseStyles: (StyleProp<ViewStyle> | false | null | undefined)[]
) {
  return ({ pressed }: { pressed: boolean }): StyleProp<ViewStyle> => [
    ...baseStyles,
    pressed ? { opacity: 0.75, transform: [{ scale: 0.97 }] } : null,
  ];
}
