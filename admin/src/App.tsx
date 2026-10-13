import { Routes, Route, NavLink, Navigate } from 'react-router-dom';
import { useCallback, useEffect, useState, type ReactElement } from 'react';
import Dashboard from './pages/Dashboard';
import Products from './pages/Products';
import Stock from './pages/Stock';
import Orders from './pages/Orders';
import Locations from './pages/Locations';
import Settings from './pages/Settings';
import Printer from './pages/Printer';
import Team from './pages/Team';
import Account from './pages/Account';
import Login from './pages/Login';
import { api, clearToken, getToken, type Me, type Permission } from './lib/api';
import { MeContext } from './lib/auth';

const NAV: { to: string; label: string; permission?: Permission; end?: boolean }[] = [
  { to: '/', label: 'Dashboard', end: true },
  { to: '/orders', label: 'Orders', permission: 'orders' },
  { to: '/products', label: 'Products', permission: 'products' },
  { to: '/stock', label: 'Stock', permission: 'stock' },
  { to: '/locations', label: 'Locations', permission: 'shops' },
  { to: '/settings', label: 'WhatsApp & phone', permission: 'settings' },
  { to: '/printer', label: 'Printer', permission: 'settings' },
  { to: '/team', label: 'Team', permission: 'users' },
  { to: '/account', label: 'My account' },
];

export default function App() {
  const [me, setMe] = useState<Me | null>(null);
  const [checking, setChecking] = useState(!!getToken());

  const loadMe = useCallback(async () => {
    try {
      setMe(await api<Me>('/api/admin/me'));
    } catch {
      setMe(null);
    } finally {
      setChecking(false);
    }
  }, []);

  useEffect(() => {
    if (getToken()) loadMe();
  }, [loadMe]);

  // The API tells us when the session is no longer valid (e.g. the owner switched this account off).
  useEffect(() => {
    const onUnauthorized = () => setMe(null);
    window.addEventListener('kamba-unauthorized', onUnauthorized);
    return () => window.removeEventListener('kamba-unauthorized', onUnauthorized);
  }, []);

  if (checking) return <p className="muted" style={{ padding: 24 }}>Loading…</p>;
  if (!me) return <Login onLogin={setMe} />;

  const can = (p?: Permission) => !p || me.permissions.includes(p);
  const guard = (permission: Permission | undefined, element: ReactElement) =>
    can(permission) ? element : <Navigate to="/" replace />;

  return (
    <MeContext.Provider value={me}>
      <div className="layout">
        <aside className="sidebar">
          <h1>Kamba Online</h1>
          <nav>
            {NAV.filter((n) => can(n.permission)).map((n) => (
              <NavLink key={n.to} to={n.to} end={n.end}>
                {n.label}
              </NavLink>
            ))}
          </nav>
          <div className="who">
            {me.full_name}
            <span>{me.role === 'owner' ? 'Owner' : 'Staff'}</span>
          </div>
          <button
            className="btn btn-sm logout"
            onClick={() => {
              clearToken();
              setMe(null);
            }}>
            Log out
          </button>
        </aside>
        <main className="main">
          <Routes>
            <Route path="/" element={<Dashboard />} />
            <Route path="/orders" element={guard('orders', <Orders />)} />
            <Route path="/products" element={guard('products', <Products />)} />
            <Route path="/stock" element={guard('stock', <Stock />)} />
            <Route path="/locations" element={guard('shops', <Locations />)} />
            <Route path="/settings" element={guard('settings', <Settings />)} />
            <Route path="/printer" element={guard('settings', <Printer />)} />
            <Route path="/team" element={guard('users', <Team />)} />
            <Route path="/account" element={<Account />} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </main>
      </div>
    </MeContext.Provider>
  );
}
