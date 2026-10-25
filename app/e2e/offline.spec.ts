import { expect, openSignIn, DEMO_INN, DEMO_PASSWORD, signInAsDemo, test } from './fixtures';

type MockWindow = { __AGRO_MOCK__: { offline?: boolean } };

test('офлайн-плашка появляется при потере связи и исчезает после её возвращения', async ({ page }) => {
  await signInAsDemo(page);
  await page.getByRole('tab', { name: 'Отчеты' }).click();
  await page.getByRole('button', { name: /^Форма 1-ИСО-р/ }).click();
  await expect(page.getByRole('heading', { name: 'Превью · 1-ИСО-р' })).toBeVisible();
  await expect(page.getByText('Вы офлайн')).toHaveCount(0);

  // Флаги демо-слоя данных (src/data/mock.ts): имитация отсутствия сети без перезагрузки страницы.
  await page.evaluate(() => {
    (window as unknown as MockWindow).__AGRO_MOCK__ = { offline: true };
  });
  await expect(page.getByText('Вы офлайн').first()).toBeVisible();
  await expect(page.getByText(/Данные из кеша на/).first()).toBeVisible();
  await expect(page.getByRole('button', { name: 'Повторить подключение' }).first()).toBeVisible();

  await page.evaluate(() => {
    (window as unknown as MockWindow).__AGRO_MOCK__ = { offline: false };
  });
  await expect(page.getByText('Вы офлайн')).toHaveCount(0);
});

test('вход без сети: сообщение «Нет подключения к сети»', async ({ page }) => {
  await openSignIn(page, '/?mock=offline');
  await page.getByTestId('inn-input').fill(DEMO_INN);
  await page.getByTestId('password-input').fill(DEMO_PASSWORD);
  await page.getByTestId('sign-in-button').click();
  await expect(page.getByText(/Нет подключения к сети/).first()).toBeVisible();
});
