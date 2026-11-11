import { Platform } from 'react-native';
import * as Notifications from 'expo-notifications';
import * as Device from 'expo-device';
import Constants, { ExecutionEnvironment } from 'expo-constants';
import type { ApiClient } from '@horaires/api-client';

// Notifications push (écran du téléphone, app fermée comprise). Ne marchent
// que dans l'app compilée avec EAS Build : Expo Go et le simulateur n'en
// reçoivent pas — dans ce cas on ne fait rien, la cloche reste la source.
// L'apiClient est passé en paramètre (pas importé d'AuthService) pour
// qu'AuthService puisse désenregistrer le téléphone à la déconnexion sans
// import circulaire.

// App ouverte : on affiche quand même la bannière (la cloche se met aussi à
// jour en direct).
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
  }),
});

let registeredToken: string | null = null;

function canReceivePush() {
  return Device.isDevice && Constants.executionEnvironment !== ExecutionEnvironment.StoreClient;
}

// À chaque ouverture de session : demande l'autorisation (une seule fois,
// le système retient la réponse), récupère le token Expo du téléphone et le
// confie au backend. Échec silencieux : sans push, l'app marche quand même.
export async function registerForPush(client: ApiClient): Promise<void> {
  if (!canReceivePush()) return;
  try {
    if (Platform.OS === 'android') {
      await Notifications.setNotificationChannelAsync('default', {
        name: 'Notifications',
        importance: Notifications.AndroidImportance.HIGH,
      });
    }
    const current = await Notifications.getPermissionsAsync();
    const granted = current.granted || (await Notifications.requestPermissionsAsync()).granted;
    if (!granted) return;

    const projectId = Constants.expoConfig?.extra?.eas?.projectId ?? Constants.easConfig?.projectId;
    const { data: token } = await Notifications.getExpoPushTokenAsync({ projectId });
    await client.registerPushToken(token, Platform.OS === 'ios' ? 'ios' : 'android');
    registeredToken = token;
  } catch {
    // Pas de push sur ce téléphone pour cette session.
  }
}

// À la déconnexion, AVANT d'effacer la session (la requête doit encore être
// authentifiée) : ce téléphone ne reçoit plus les push de ce compte.
export async function unregisterPush(client: ApiClient): Promise<void> {
  const token = registeredToken;
  registeredToken = null;
  if (!token) return;
  await client.unregisterPushToken(token).catch(() => {});
}
