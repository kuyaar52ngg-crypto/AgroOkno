import { expect, signInAsDemo, test } from './fixtures';

test('событие «Надой» добавляется и появляется в журнале и в итогах месяца', async ({ page }) => {
  await signInAsDemo(page);

  await page.getByRole('tab', { name: 'Добавить' }).click();
  await expect(page.getByRole('heading', { name: 'Новое событие' })).toBeVisible();
  await page.getByRole('radio', { name: 'Надой' }).click();
  await page.getByLabel('Объем, л').fill('55');
  await page.getByRole('button', { name: 'Сохранить' }).click();

  await expect(page.getByRole('heading', { name: 'Событие сохранено' })).toBeVisible();
  await expect(page.getByText('Надой · 55 л')).toBeVisible();
  await expect(page.getByText('Запись добавлена в учет.')).toBeVisible();

  await page.getByRole('button', { name: 'Открыть журнал' }).first().click();
  await expect(page.getByRole('heading', { name: 'Журнал учета' })).toBeVisible();
  // В демо-журнале нет записей на 55 л: эта запись только что создана.
  await expect(page.getByText('55 л', { exact: true })).toBeVisible();

  // Сводка пересчитана: 1 200 л демо + 55 л.
  await expect(page.getByText(/Октябрь: надой 1\s255 л/)).toBeVisible();
});

test('без объёма событие не сохраняется', async ({ page }) => {
  await signInAsDemo(page);
  await page.getByRole('tab', { name: 'Добавить' }).click();
  await page.getByRole('radio', { name: 'Надой' }).click();
  await page.getByRole('button', { name: 'Сохранить' }).click();
  await expect(page.getByRole('heading', { name: 'Событие сохранено' })).toHaveCount(0);
  await expect(page.getByRole('heading', { name: 'Новое событие' })).toBeVisible();
});
