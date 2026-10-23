import { Linking, Platform } from 'react-native';
import * as WebBrowser from 'expo-web-browser';

/** Открывает/скачивает файл по ссылке: на вебе — через <a download>, на устройстве — во внешнем браузере. */
export async function openUrl(url: string, filename?: string): Promise<void> {
  if (Platform.OS === 'web') {
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.target = '_blank';
    anchor.rel = 'noopener noreferrer';
    if (filename) anchor.download = filename;
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    return;
  }
  if (url.startsWith('data:')) {
    await Linking.openURL(url);
    return;
  }
  await WebBrowser.openBrowserAsync(url);
}
