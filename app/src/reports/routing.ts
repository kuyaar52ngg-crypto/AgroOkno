// «Куда попадут данные»: какие формы и системы затронет событие. Чистая функция, без сети.
import type { Destination, Farm, NewEvent } from '../data/contract';
import { HORSES } from './period';

const horse = (group: string) => (HORSES as readonly string[]).includes(group);

export function getEventDestinations(input: NewEvent, farm: Farm | null): Destination[] {
  const lph = farm?.legal_status === 'lph';
  const book: Destination[] = lph ? [{ kind: 'household_book', label: 'Похозяйственная книга' }] : [];

  switch (input.type) {
    case 'livestock': {
      const list: Destination[] = [
        { kind: 'journal', label: 'Журнал учета' },
        { kind: 'form', label: 'Форма 1-ИСО-р', form_code: '1-iso-r' },
        { kind: 'form', label: 'Форма 3-фермер (рег)', form_code: '3-fermer-month' },
      ];
      if (horse(input.animal_group)) list.push({ kind: 'form', label: 'Форма 1-ТАБУН', form_code: '1-tabun' });
      if (!lph) list.push({ kind: 'form', label: 'Форма 3-фермер · раздел поголовья', form_code: '3-fermer' });
      if (input.kind !== 'opening_balance') list.push({ kind: 'mercury', label: 'Меркурий' });
      return [...list, ...book];
    }
    case 'product_output': {
      const list: Destination[] = [
        { kind: 'journal', label: 'Журнал учета' },
        { kind: 'form', label: '3-фермер (рег) · следующий период', form_code: '3-fermer-month' },
      ];
      if (input.product === 'milk' || input.product === 'eggs') {
        list.push({ kind: 'form', label: 'Форма 1-ИСО-р', form_code: '1-iso-r' });
      }
      return list;
    }
    case 'product_sale':
      return [
        { kind: 'journal', label: 'Журнал учета' },
        { kind: 'form', label: '3-фермер (рег) · следующий период', form_code: '3-fermer-month' },
        { kind: 'mercury', label: 'Меркурий' },
      ];
    case 'feed':
      return [
        { kind: 'journal', label: 'Журнал учета' },
        { kind: 'form', label: '10-СХ · следующий отчетный период', form_code: '10-sh' },
      ];
    case 'crop': {
      const list: Destination[] = [
        { kind: 'journal', label: 'Журнал учета' },
        { kind: 'form', label: 'Раздел растениеводства · данные участка' },
      ];
      if (!lph) {
        list.push(
          { kind: 'form', label: 'Форма 1-фермер', form_code: '1-fermer' },
          { kind: 'form', label: 'Форма 2-фермер', form_code: '2-fermer' },
        );
      }
      return [...list, ...book];
    }
  }
}
