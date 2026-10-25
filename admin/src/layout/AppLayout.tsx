import { useState } from 'react';
import { NavLink, Outlet } from 'react-router-dom';

import { useAuth } from '../auth/AuthContext';
import { Button } from '../ui/Button';
import { Icon } from '../ui/Icons';
import type { IconName } from '../ui/Icons';

const NAV: { to: string; label: string; icon: IconName; end?: boolean }[] = [
  { to: '/', label: 'Сводка', icon: 'dashboard', end: true },
  { to: '/users', label: 'Пользователи', icon: 'users' },
  { to: '/farms', label: 'Хозяйства', icon: 'farm' },
  { to: '/reports', label: 'Отчёты', icon: 'reports' },
  { to: '/deadlines', label: 'Сроки', icon: 'calendar' },
  { to: '/support', label: 'Поддержка', icon: 'support' },
  { to: '/broadcasts', label: 'Рассылки', icon: 'megaphone' },
  { to: '/assistant', label: 'Модель помощника', icon: 'assistant' },
  { to: '/audit', label: 'Журнал действий', icon: 'log' },
];

export function Logo() {
  return (
    <span className="logo">
      <span className="logo__mark" aria-hidden="true">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="#fff">
          <path d="M4 20V4h16v16H4zm2-2h5v-4.5H6V18zm0-6.5h5V6H6v5.5zM13 18h5v-4.5h-5V18zm0-6.5h5V6h-5v5.5z" />
        </svg>
      </span>
      <span className="logo__text">
        АгроОкно <span className="logo__sub">Admin</span>
      </span>
    </span>
  );
}

export function AppLayout() {
  const { displayEmail, signOut, mock } = useAuth();
  const [menuOpen, setMenuOpen] = useState(false);
  const [leaving, setLeaving] = useState(false);

  const leave = async () => {
    setLeaving(true);
    try {
      await signOut();
    } finally {
      setLeaving(false);
    }
  };

  return (
    <div className="shell">
      <a href="#content" className="skip-link">
        К содержимому
      </a>
      <aside className={`sidebar${menuOpen ? ' is-open' : ''}`} aria-label="Разделы">
        <div className="sidebar__brand">
          <Logo />
        </div>
        <nav className="sidebar__nav">
          {NAV.map((item) => (
            <NavLink key={item.to} to={item.to} end={item.end} className={({ isActive }) => `nav-link${isActive ? ' is-active' : ''}`} onClick={() => setMenuOpen(false)}>
              <Icon name={item.icon} size={20} />
              <span>{item.label}</span>
            </NavLink>
          ))}
        </nav>
      </aside>
      {menuOpen ? <button type="button" className="sidebar-scrim" aria-label="Закрыть меню" onClick={() => setMenuOpen(false)} /> : null}

      <div className="shell__main">
        <header className="topbar">
          <button type="button" className="icon-btn topbar__menu" aria-label="Открыть меню" aria-expanded={menuOpen} onClick={() => setMenuOpen((v) => !v)}>
            <Icon name="menu" size={22} />
          </button>
          <div className="grow" />
          {mock ? <span className="mock-badge">Демо-данные</span> : null}
          <span className="topbar__email" title={displayEmail}>
            {displayEmail}
          </span>
          <Button variant="secondary" size="sm" onClick={leave} loading={leaving} icon={<Icon name="logout" size={16} />}>
            Выйти
          </Button>
        </header>
        <main id="content" className="content" tabIndex={-1}>
          <Outlet />
        </main>
      </div>
    </div>
  );
}
