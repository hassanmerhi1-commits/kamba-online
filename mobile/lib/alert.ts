import { Alert as NativeAlert, Platform, type AlertButton } from 'react-native';

/**
 * Same API as React Native's Alert, but it also works in the browser
 * (react-native-web's Alert does nothing, so messages would silently vanish).
 */
export const Alert = {
  alert(title: string, message?: string, buttons?: AlertButton[]) {
    if (Platform.OS !== 'web') {
      NativeAlert.alert(title, message, buttons);
      return;
    }
    window.alert(message ? `${title}\n\n${message}` : title);
    // A single button is a plain "OK, continue" action, so run it after the message is dismissed.
    if (buttons?.length === 1) buttons[0].onPress?.();
  },
};
