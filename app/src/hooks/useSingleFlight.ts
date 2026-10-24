import { useRef } from 'react';

/**
 * Async-обработчик нажатия, который не запускается повторно, пока идёт предыдущий вызов.
 * `loading` у кнопки включается только после перерисовки — двойное нажатие успевает проскочить
 * и, например, отправить два письма с разными кодами.
 */
export function useSingleFlight<A extends unknown[]>(handler: (...args: A) => Promise<void>) {
  const busy = useRef(false);
  return async (...args: A) => {
    if (busy.current) return;
    busy.current = true;
    try {
      await handler(...args);
    } finally {
      busy.current = false;
    }
  };
}
