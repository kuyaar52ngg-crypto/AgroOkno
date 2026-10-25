import { useEffect } from 'react';

/** Заголовок вкладки: «Раздел · АгроОкно Admin». */
export function usePageTitle(title: string): void {
  useEffect(() => {
    const previous = document.title;
    document.title = `${title} · АгроОкно Admin`;
    return () => {
      document.title = previous;
    };
  }, [title]);
}
