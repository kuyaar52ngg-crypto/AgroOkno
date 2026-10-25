import { useEffect, useEffectEvent, useState } from 'react';

import { useDebounced } from '../hooks/useDebounced';
import { SearchInput } from './Fields';

/** Поиск с дебаунсом: значение живёт в адресе (`value`), `onChange` вызывается через 350 мс после паузы в наборе. */
export function SearchBox({ value, onChange, label, placeholder }: { value: string; onChange: (v: string) => void; label: string; placeholder?: string }) {
  const [text, setText] = useState(value);
  const [seen, setSeen] = useState(value);
  if (value !== seen) {
    // адрес изменили снаружи (кнопка «Назад», ссылка) — обновляем поле
    setSeen(value);
    setText(value);
  }
  const debounced = useDebounced(text);
  const emit = useEffectEvent((v: string) => {
    if (v !== value) onChange(v);
  });
  useEffect(() => {
    emit(debounced.trim());
  }, [debounced]);

  return <SearchInput label={label} placeholder={placeholder} value={text} onChange={(e) => setText(e.target.value)} />;
}
