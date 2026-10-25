// https://docs.expo.dev/guides/using-eslint/
const { defineConfig } = require('eslint/config');
const expoConfig = require('eslint-config-expo/flat');

module.exports = defineConfig([
  expoConfig,
  {
    ignores: ['dist/*', 'e2e/.dist/**', 'playwright-report/**', 'test-results/**'],
  },
  {
    rules: {
      // Корневой импорт lucide-react-native тянет в бандл все ~1900 иконок (+2 МБ) — иконки берём поштучно.
      'no-restricted-imports': [
        'error',
        {
          paths: [
            {
              name: 'lucide-react-native',
              allowTypeImports: true,
              message: "Импортируйте иконку поштучно: import House from 'lucide-react-native/icons/house'.",
            },
          ],
        },
      ],
    },
  },
]);
