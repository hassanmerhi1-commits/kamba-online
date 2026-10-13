import { useEffect, useState, type FormEvent } from 'react';
import { api, errorText, type Settings as SettingsData } from '../lib/api';
import { useLoad } from '../lib/useLoad';

export default function Settings() {
  const { data, error, reload } = useLoad<SettingsData>('/api/admin/settings');
  const [whatsapp, setWhatsapp] = useState('');
  const [office, setOffice] = useState('');
  const [busy, setBusy] = useState(false);
  const [saveError, setSaveError] = useState('');
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    if (data) {
      setWhatsapp(data.whatsapp_number);
      setOffice(data.main_office_phone);
    }
  }, [data]);

  const save = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setSaveError('');
    setSaved(false);
    try {
      await api('/api/admin/settings', {
        method: 'PUT',
        body: { whatsapp_number: whatsapp, main_office_phone: office },
      });
      await reload();
      setSaved(true);
    } catch (err) {
      setSaveError(errorText(err));
    } finally {
      setBusy(false);
    }
  };

  if (error) return <p className="error">{error}</p>;
  if (!data) return <p className="muted">Loading…</p>;

  const digits = whatsapp.replace(/\D/g, '');

  return (
    <>
      <h2 className="page-title">WhatsApp &amp; phone</h2>
      <form className="card" onSubmit={save} style={{ maxWidth: 560 }}>
        <label className="field">
          WhatsApp number for orders
          <input
            value={whatsapp}
            onChange={(e) => setWhatsapp(e.target.value)}
            placeholder="+244 923 456 789"
            inputMode="tel"
          />
          <span className="muted small">
            With the country code (Angola is 244). Customers who choose "Order via WhatsApp" send their order to this number.
            {data.whatsapp_number === '' && ' Until you set it, the WhatsApp buttons are hidden in the customer app.'}
          </span>
        </label>

        <label className="field">
          Main office phone (shown to customers)
          <input value={office} onChange={(e) => setOffice(e.target.value)} placeholder="+244 923 456 000" inputMode="tel" />
        </label>

        {digits.length >= 8 && (
          <p className="small">
            Test link: <a href={`https://wa.me/${digits}`} target="_blank" rel="noreferrer">wa.me/{digits}</a>
          </p>
        )}
        {saveError && <p className="error">{saveError}</p>}
        {saved && <p className="ok">Saved. The customer app uses the new numbers right away.</p>}
        <button className="btn" type="submit" disabled={busy}>{busy ? 'Saving…' : 'Save'}</button>
      </form>
    </>
  );
}
