// Веб: заметная обводка фокуса для управления с клавиатуры (WCAG 2.4.7, 2.4.11).
// Системная обводка браузера тонкая и тёмная, на синих кнопках её почти не видно.
// Поля ввода гасят обводку своим стилем и показывают фокус рамкой, поэтому их правило не перебивает.
import { Platform } from 'react-native';

const STYLE_ID = 'agro-focus-visible';

if (Platform.OS === 'web' && typeof document !== 'undefined' && !document.getElementById(STYLE_ID)) {
  const style = document.createElement('style');
  style.id = STYLE_ID;
  style.textContent = `
    :focus-visible:not(input):not(textarea) { outline: 3px solid #1E3A8A; outline-offset: 2px; }
    @media (prefers-reduced-motion: reduce) {
      *, *::before, *::after { animation-duration: 0.01ms !important; transition-duration: 0.01ms !important; }
    }
  `;
  document.head.appendChild(style);
}
