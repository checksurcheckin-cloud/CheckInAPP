import { IsIn, Matches } from 'class-validator';

// Token Expo du téléphone (expo-notifications, getExpoPushTokenAsync) —
// jamais un token natif FCM/APNs : c'est Expo qui relaie vers Google/Apple.
const EXPO_PUSH_TOKEN = /^Expo(nent)?PushToken\[[^\]]+\]$/;

export class RegisterPushTokenDto {
  @Matches(EXPO_PUSH_TOKEN, { message: 'Token push Expo invalide' })
  token: string;

  @IsIn(['ios', 'android'])
  platform: string;
}

export class UnregisterPushTokenDto {
  @Matches(EXPO_PUSH_TOKEN, { message: 'Token push Expo invalide' })
  token: string;
}
