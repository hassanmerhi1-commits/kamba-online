import { useState, type FormEvent } from 'react';
import { api, errorText } from '../lib/api';
import { useMe } from '../lib/auth';

export default function Account() {
  const me = useMe();
  const [form, setForm] = useState({ current_password: '', new_password: '' });
  const [error, setError] = useState('');
  const [saved, setSaved] = useState(false);
  const [busy, setBusy] = useState(false);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError('');
    setSaved(false);
    try {
      await api('/api/admin/password', { method: 'POST', body: form });
      setForm({ current_password: '', new_password: '' });
      setSaved(true);
    } catch (err) {
      setError(errorText(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <h2 className="page-title">My account</h2>
      <div className="card" style={{ maxWidth: 560 }}>
        <p>
          <strong>{me.full_name}</strong> <span className="muted">@{me.username}</span>
        </p>
        <p className="muted small" style={{ marginTop: 4 }}>
          {me.role === 'owner' ? 'Owner: full access.' : `You can use: ${me.permissions.join(', ') || 'nothing yet. Ask the owner.'}`}
        </p>
      </div>

      <form className="card" onSubmit={submit} style={{ maxWidth: 560 }}>
        <h3 style={{ marginBottom: 12 }}>Change my password</h3>
        <label className="field">
          Current password
          <input type="password" value={form.current_password} onChange={(e) => setForm((f) => ({ ...f, current_password: e.target.value }))} required />
        </label>
        <label className="field">
          New password (at least 6 characters)
          <input type="password" value={form.new_password} onChange={(e) => setForm((f) => ({ ...f, new_password: e.target.value }))} required />
        </label>
        {error && <p className="error">{error}</p>}
        {saved && <p className="ok">Password changed.</p>}
        <button className="btn" type="submit" disabled={busy}>{busy ? 'Saving…' : 'Change password'}</button>
      </form>
    </>
  );
}
