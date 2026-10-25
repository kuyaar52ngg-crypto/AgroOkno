import { expect, signInAsDemo, test } from './fixtures';

test('предпросмотр отчёта 1-ИСО-р открывается из списка с автозаполненными данными', async ({ page }) => {
  await signInAsDemo(page);
  await page.getByRole('tab', { name: 'Отчеты' }).click();
  await expect(page.getByRole('heading', { name: 'Мои отчеты' })).toBeVisible();

  await page.getByRole('button', { name: /^Форма 1-ИСО-р/ }).click();
  await expect(page).toHaveURL(/\/reports\/1-iso-r/);
  await expect(page.getByRole('heading', { name: 'Превью · 1-ИСО-р' })).toBeVisible();
  await expect(page.getByText('Автозаполненные данные')).toBeVisible();
  await expect(page.getByText('Всего животных')).toBeVisible();
  await expect(page.getByText('79 голов')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Проверить и отправить' })).toBeVisible();
});
