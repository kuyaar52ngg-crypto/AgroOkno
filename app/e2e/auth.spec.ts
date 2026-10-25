import { DEMO_INN, expect, openSignIn, signInAsDemo, test } from './fixtures';

test.describe('вход', () => {
  test('демо-пользователь входит по ИНН и попадает на главную', async ({ page }) => {
    await signInAsDemo(page);
    await expect(page.getByText('Здравствуйте, Иван Иванов')).toBeVisible();
    await expect(page.getByRole('tab', { name: 'Отчеты' })).toBeVisible();
  });

  test('неверный пароль: сообщение об ошибке, пользователь остаётся на экране входа', async ({ page }) => {
    await openSignIn(page);
    await page.getByTestId('inn-input').fill(DEMO_INN);
    await page.getByTestId('password-input').fill('НеверныйПароль1');
    await page.getByTestId('sign-in-button').click();
    await expect(page.getByText('Неверный ИНН или пароль').first()).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Вход' })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Мое хозяйство' })).toHaveCount(0);
  });

  test('пустые поля: подсказка без запроса к серверу', async ({ page }) => {
    await openSignIn(page);
    await page.getByTestId('sign-in-button').click();
    await expect(page.getByText('Введите ИНН, email или телефон').first()).toBeVisible();
  });
});
