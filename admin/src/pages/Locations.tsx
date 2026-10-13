import { useState, type FormEvent } from 'react';
import { api, errorText, type Shop } from '../lib/api';
import { useLoad } from '../lib/useLoad';

interface FormState {
  name: string;
  address: string;
  phone: string;
  latitude: string;
  longitude: string;
}

const emptyForm: FormState = { name: '', address: '', phone: '', latitude: '', longitude: '' };

const fromShop = (s: Shop): FormState => ({
  name: s.name,
  address: s.address,
  phone: s.phone,
  latitude: s.latitude ? String(s.latitude) : '',
  longitude: s.longitude ? String(s.longitude) : '',
});

function ShopForm({ shop, onSaved, onCancel }: { shop: Shop | null; onSaved: () => void; onCancel: () => void }) {
  const [form, setForm] = useState<FormState>(shop ? fromShop(shop) : emptyForm);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const set = (field: keyof FormState) => (e: { target: { value: string } }) =>
    setForm((f) => ({ ...f, [field]: e.target.value }));

  const save = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError('');
    const body = {
      name: form.name,
      address: form.address,
      phone: form.phone,
      latitude: form.latitude === '' ? 0 : Number(form.latitude),
      longitude: form.longitude === '' ? 0 : Number(form.longitude),
    };
    try {
      if (shop) await api(`/api/admin/shops/${shop.id}`, { method: 'PUT', body });
      else await api('/api/admin/shops', { method: 'POST', body });
      onSaved();
    } catch (err) {
      setError(errorText(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <form className="card" onSubmit={save}>
      <h3 style={{ marginBottom: 14 }}>{shop ? `Edit: ${shop.name}` : 'New location'}</h3>
      <div className="grid-form">
        <label>
          Name
          <input value={form.name} onChange={set('name')} required placeholder="e.g. Loja Centro" />
        </label>
        <label>
          Phone
          <input value={form.phone} onChange={set('phone')} placeholder="+244 …" />
        </label>
        <label style={{ gridColumn: '1 / -1' }}>
          Address
          <input value={form.address} onChange={set('address')} required placeholder="Street, neighbourhood, Soyo" />
        </label>
        <label>
          Latitude (optional)
          <input type="number" step="any" value={form.latitude} onChange={set('latitude')} placeholder="-6.1349" />
        </label>
        <label>
          Longitude (optional)
          <input type="number" step="any" value={form.longitude} onChange={set('longitude')} placeholder="12.3689" />
        </label>
      </div>
      <p className="muted small" style={{ marginTop: 6 }}>
        With coordinates, customers get exact directions on the map. Without them the address is searched on the map.
      </p>
      {error && <p className="error">{error}</p>}
      <div className="form-row" style={{ marginTop: 12 }}>
        <button className="btn" type="submit" disabled={busy}>{busy ? 'Saving…' : shop ? 'Save changes' : 'Add location'}</button>
        <button className="btn btn-outline" type="button" onClick={onCancel}>Cancel</button>
      </div>
    </form>
  );
}

export default function Locations() {
  const { data, error, reload } = useLoad<Shop[]>('/api/admin/shops');
  const [editing, setEditing] = useState<Shop | 'new' | null>(null);
  const [actionError, setActionError] = useState('');

  const toggle = async (s: Shop) => {
    if (s.is_active && !window.confirm(`Switch off "${s.name}"?\n\nIts stock stops counting and it is hidden from customers.`)) return;
    try {
      await api(`/api/admin/shops/${s.id}`, { method: 'PUT', body: { is_active: !s.is_active } });
      setActionError('');
      await reload();
    } catch (err) {
      setActionError(errorText(err));
    }
  };

  if (error) return <p className="error">{error}</p>;
  if (!data) return <p className="muted">Loading…</p>;

  const done = async () => {
    setEditing(null);
    await reload();
  };

  return (
    <>
      <div className="page-head">
        <h2 className="page-title">Shop locations</h2>
        <button className="btn" onClick={() => setEditing('new')}>+ New location</button>
      </div>
      <p className="muted" style={{ marginBottom: 16 }}>
        These appear in the customer app as company locations. Orders always go to the main office. Stock is kept per
        location (see the Stock page) and customers never see it.
      </p>
      {actionError && <p className="error">{actionError}</p>}

      {editing && (
        <ShopForm
          key={editing === 'new' ? 'new' : editing.id}
          shop={editing === 'new' ? null : editing}
          onSaved={done}
          onCancel={() => setEditing(null)}
        />
      )}

      <div className="card">
        <table>
          <thead>
            <tr>
              <th>Name</th>
              <th>Address</th>
              <th>Phone</th>
              <th>Shown to customers</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {data.map((s) => (
              <tr key={s.id} style={s.is_active ? undefined : { opacity: 0.55 }}>
                <td>{s.name}</td>
                <td>{s.address}</td>
                <td>{s.phone}</td>
                <td>{s.is_active ? 'Yes' : 'No (switched off)'}</td>
                <td style={{ whiteSpace: 'nowrap' }}>
                  <button className="btn btn-sm" onClick={() => setEditing(s)}>Edit</button>
                  <button className="btn btn-sm btn-outline" onClick={() => toggle(s)}>
                    {s.is_active ? 'Switch off' : 'Switch on'}
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {data.length === 0 && <p className="muted">No locations yet.</p>}
      </div>
    </>
  );
}
