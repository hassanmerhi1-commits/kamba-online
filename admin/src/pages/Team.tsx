import { useState, type FormEvent } from 'react';
import { api, errorText, type Me, type Permission } from '../lib/api';
import { useLoad } from '../lib/useLoad';

const OPTIONS: { key: Exclude<Permission, 'users'>; label: string; help: string }[] = [
  { key: 'orders', label: 'Orders', help: 'See orders, change their status, cancel orders' },
  { key: 'products', label: 'Products & photos', help: 'Add, edit and delete products, upload photos, manage categories' },
  { key: 'stock', label: 'Stock', help: 'Update quantities in each shop' },
  { key: 'shops', label: 'Locations', help: 'Add and edit shop locations' },
  { key: 'settings', label: 'WhatsApp & phone', help: 'Change the WhatsApp number and office phone' },
];

type Key = (typeof OPTIONS)[number]['key'];

function PermissionBoxes({ value, onChange }: { value: Key[]; onChange: (next: Key[]) => void }) {
  const toggle = (key: Key) => onChange(value.includes(key) ? value.filter((k) => k !== key) : [...value, key]);
  return (
    <div className="perm-list">
      {OPTIONS.map((o) => (
        <label key={o.key} className="perm">
          <input type="checkbox" checked={value.includes(o.key)} onChange={() => toggle(o.key)} />
          <span>
            <strong>{o.label}</strong>
            <span className="muted small"> — {o.help}</span>
          </span>
        </label>
      ))}
    </div>
  );
}

const onlyKeys = (p: Permission[]) => p.filter((x): x is Key => x !== 'users');

function MemberCard({ member, onChanged }: { member: Me; onChanged: () => void }) {
  const isOwner = member.role === 'owner';
  const [perms, setPerms] = useState<Key[]>(onlyKeys(member.permissions));
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  const changed = [...perms].sort().join() !== [...onlyKeys(member.permissions)].sort().join();

  const update = async (body: Record<string, unknown>, message: string) => {
    try {
      await api(`/api/admin/staff/${member.id}`, { method: 'PUT', body });
      setError('');
      setNotice(message);
      onChanged();
    } catch (err) {
      setError(errorText(err));
      setNotice('');
    }
  };

  const resetPassword = () => {
    const pw = window.prompt(`New password for ${member.full_name} (at least 6 characters).\nThey will be signed out everywhere.`);
    if (pw === null) return;
    update({ password: pw }, 'Password changed.');
  };

  return (
    <div className="card" style={member.is_active ? undefined : { opacity: 0.65 }}>
      <div className="page-head">
        <div>
          <strong>{member.full_name}</strong> <span className="muted">@{member.username}</span>{' '}
          <span className={`badge ${isOwner ? 'badge-confirmed' : 'badge-pending'}`}>{isOwner ? 'Owner' : 'Staff'}</span>
          {!member.is_active && <span className="badge badge-cancelled" style={{ marginLeft: 6 }}>Switched off</span>}
        </div>
        <div>
          <button className="btn btn-sm btn-outline" onClick={resetPassword}>Reset password</button>
          {!isOwner && (
            <button
              className="btn btn-sm btn-outline"
              onClick={() =>
                update(
                  { is_active: !member.is_active },
                  member.is_active ? 'Switched off. They were signed out.' : 'Switched on.'
                )
              }>
              {member.is_active ? 'Switch off' : 'Switch on'}
            </button>
          )}
        </div>
      </div>

      {isOwner ? (
        <p className="muted small">The owner can do everything and cannot be restricted.</p>
      ) : (
        <>
          <PermissionBoxes value={perms} onChange={setPerms} />
          {changed && (
            <button className="btn btn-sm" onClick={() => update({ permissions: perms }, 'Permissions saved.')}>
              Save permissions
            </button>
          )}
        </>
      )}
      {error && <p className="error">{error}</p>}
      {notice && <p className="ok">{notice}</p>}
    </div>
  );
}

export default function Team() {
  const { data, error, reload } = useLoad<Me[]>('/api/admin/staff');
  const [form, setForm] = useState({ full_name: '', username: '', password: '' });
  const [perms, setPerms] = useState<Key[]>(['orders', 'stock']);
  const [formError, setFormError] = useState('');
  const [busy, setBusy] = useState(false);

  const create = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setFormError('');
    try {
      await api('/api/admin/staff', { method: 'POST', body: { ...form, permissions: perms } });
      setForm({ full_name: '', username: '', password: '' });
      await reload();
    } catch (err) {
      setFormError(errorText(err));
    } finally {
      setBusy(false);
    }
  };

  if (error) return <p className="error">{error}</p>;
  if (!data) return <p className="muted">Loading…</p>;

  return (
    <>
      <h2 className="page-title">Team</h2>
      <p className="muted" style={{ marginBottom: 16 }}>
        Create a login for each staff member and choose exactly what they can do. They sign in on the same Admin screen.
        Only the owner sees this page.
      </p>

      <form className="card" onSubmit={create}>
        <h3 style={{ marginBottom: 12 }}>Add a staff member</h3>
        <div className="grid-form">
          <label>
            Full name
            <input value={form.full_name} onChange={(e) => setForm((f) => ({ ...f, full_name: e.target.value }))} required />
          </label>
          <label>
            Username (for login)
            <input
              value={form.username}
              onChange={(e) => setForm((f) => ({ ...f, username: e.target.value }))}
              required
              autoComplete="off"
              placeholder="e.g. ana"
            />
          </label>
          <label>
            Password (at least 6 characters)
            <input
              type="text"
              value={form.password}
              onChange={(e) => setForm((f) => ({ ...f, password: e.target.value }))}
              required
              autoComplete="off"
            />
          </label>
        </div>
        <p style={{ margin: '12px 0 6px', fontWeight: 700 }}>What can they do?</p>
        <PermissionBoxes value={perms} onChange={setPerms} />
        {formError && <p className="error">{formError}</p>}
        <button className="btn" type="submit" disabled={busy} style={{ marginTop: 10 }}>
          {busy ? 'Creating…' : 'Create account'}
        </button>
      </form>

      {data.map((m) => (
        <MemberCard key={`${m.id}-${m.is_active}-${m.permissions.join()}`} member={m} onChanged={reload} />
      ))}
    </>
  );
}
