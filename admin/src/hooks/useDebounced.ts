import { useEffect, useState } from 'react';

/** Значение, которое обновляется через `delay` мс после последнего изменения (дебаунс поиска). */
export function useDebounced<T>(value: T, delay = 350): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(timer);
  }, [value, delay]);
  return debounced;
}
