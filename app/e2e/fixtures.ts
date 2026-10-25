import { expect, test as base, type Page } from '@playwright/test';

/** Демо-учётные данные слоя данных mock (src/data/mock.ts: DEMO_INN и DEMO_PASSWORD). */
export const DEMO_INN = '143512345660';
export const DEMO_PASSWORD = 'AgroOkno2026!';

/**
 * Базовый тест: запрещает запросы за пределы локального сервера (прод-база, шрифты, аналитика не должны вызываться)
 * и проваливается при необработанных ошибках страницы (например, ReferenceError при старте бандла).
 */
export const test = base.extend<{ page: Page }>({
  page: async ({ page }, use) => {
    const external: string[] = [];
    await page.route('**/*', (route) => {
      const url = new URL(route.request().url());
      if (['127.0.0.1', 'localhost'].includes(url.hostname) || url.protocol === 'data:' || url.protocol === 'blob:') return route.continue();
      external.push(url.href);
      return route.abort();
    });
    const errors: string[] = [];
    page.on('pageerror', (e) => errors.push(e.message));
    await use(page);
    expect(external, 'запросы за пределы локального сервера').toEqual([]);
    expect(errors, 'необработанные ошибки страницы').toEqual([]);
  },
});

export { expect };

/** Экран приветствия → «Вход»: открывает форму входа. */
export async function openSignIn(page: Page, path = '/'): Promise<void> {
  await page.goto(path);
  await expect(page.getByRole('heading', { name: 'Добро пожаловать в АгроОкно' })).toBeVisible();
  await page.getByRole('button', { name: 'Начать работу' }).click();
  await expect(page.getByRole('heading', { name: 'Вход' })).toBeVisible();
}

/** Входит под демо-пользователем и проходит экран выбора роли: в конце открыта главная «Мое хозяйство». */
export async function signInAsDemo(page: Page): Promise<void> {
  await openSignIn(page);
  await page.getByTestId('inn-input').fill(DEMO_INN);
  await page.getByTestId('password-input').fill(DEMO_PASSWORD);
  await page.getByTestId('sign-in-button').click();
  await expect(page.getByRole('heading', { name: 'Выбор роли' })).toBeVisible();
  await page.getByRole('button', { name: 'Продолжить' }).click();
  await expect(page.getByRole('heading', { name: 'Мое хозяйство' })).toBeVisible();
}
