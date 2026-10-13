import { useEffect, useState, type FormEvent } from 'react';
import { api, errorText, type PrinterState } from '../lib/api';
import { useLoad } from '../lib/useLoad';

export default function Printer() {
  const { data, error, reload } = useLoad<PrinterState>('/api/admin/printer');
  const [name, setName] = useState('');
  const [auto, setAuto] = useState(true);
  const [copies, setCopies] = useState(1);
  const [title, setTitle] = useState('');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [problem, setProblem] = useState('');

  useEffect(() => {
    if (data) {
      setName(data.printer_name);
      setAuto(data.auto_print);
      setCopies(data.copies);
      setTitle(data.slip_title);
    }
  }, [data]);

  const save = async (e?: FormEvent) => {
    e?.preventDefault();
    setBusy(true);
    setProblem('');
    setMessage('');
    try {
      await api('/api/admin/printer', {
        method: 'PUT',
        body: { printer_name: name, auto_print: auto, copies, slip_title: title },
      });
      await reload();
      setMessage('Saved.');
      return true;
    } catch (err) {
      setProblem(errorText(err));
      return false;
    } finally {
      setBusy(false);
    }
  };

  const test = async () => {
    if (!(await save())) return;
    setBusy(true);
    try {
      await api('/api/admin/printer/test', { method: 'POST' });
      setMessage('Test slip sent to the printer. Check that it came out correctly.');
    } catch (err) {
      setMessage('');
      setProblem(errorText(err));
    } finally {
      setBusy(false);
      await reload();
    }
  };

  if (error) return <p className="error">{error}</p>;
  if (!data) return <p className="muted">Loading…</p>;

  const known = data.printers.some((p) => p.name === name);
  const selectedOffline = data.printers.find((p) => p.name === name)?.offline;
  const last = data.last_result;

  return (
    <>
      <h2 className="page-title">Printer</h2>
      <form className="card" onSubmit={save} style={{ maxWidth: 620 }}>
        <p className="muted small" style={{ marginTop: 0 }}>
          When a customer orders, an internal slip (80 mm) prints here for the office: customer, items, total and which
          shop the stock was taken from. It is not a tax invoice. The app must be open on this computer to print.
        </p>

        <label className="field">
          Printer
          <select value={name} onChange={(e) => setName(e.target.value)}>
            <option value="">— choose a printer —</option>
            {!known && name && <option value={name}>{name} (not found on this computer)</option>}
            {data.printers.map((p) => (
              <option key={p.name} value={p.name}>
                {p.name}
                {p.port ? ` — ${p.port}` : ''}
                {p.offline ? ' (offline)' : ''}
              </option>
            ))}
          </select>
          <span className="muted small">
            Plug in the Xprinter by USB, turn it on and install its Windows driver. It then shows up here.{' '}
            <button type="button" className="btn btn-sm" onClick={reload}>Refresh list</button>
          </span>
          {selectedOffline && (
            <span className="error">
              Windows says this printer is OFFLINE. Check that it is switched on and the USB cable is connected. Slips
              sent now wait in the Windows queue and print when it comes back.
            </span>
          )}
          {data.list_error && <span className="error">Could not read the printer list: {data.list_error}</span>}
          {!data.list_error && data.printers.length === 0 && (
            <span className="error">No printers found on this computer.</span>
          )}
        </label>

        <label className="field">
          <span>
            <input type="checkbox" checked={auto} onChange={(e) => setAuto(e.target.checked)} /> Print automatically when
            a new order arrives
          </span>
        </label>

        <label className="field">
          Copies
          <select value={copies} onChange={(e) => setCopies(Number(e.target.value))}>
            {[1, 2, 3].map((n) => (
              <option key={n} value={n}>{n}</option>
            ))}
          </select>
        </label>

        <label className="field">
          Title at the top of the slip
          <input value={title} maxLength={40} onChange={(e) => setTitle(e.target.value)} placeholder="Kamba Online" />
        </label>

        {problem && <p className="error">{problem}</p>}
        {message && <p className="ok">{message}</p>}
        <div>
          <button className="btn" type="submit" disabled={busy}>{busy ? 'Working…' : 'Save'}</button>{' '}
          <button className="btn" type="button" disabled={busy || !name} onClick={test}>Save &amp; print test slip</button>
        </div>
      </form>

      {last && (
        <p className={last.ok ? 'muted small' : 'error'}>
          Last print: {new Date(last.at).toLocaleString()} — {last.order_id === 'TEST' ? 'test slip' : `order ${last.order_id}`} —{' '}
          {last.ok ? 'OK' : `FAILED (${last.error ?? 'unknown error'})`}
        </p>
      )}
    </>
  );
}
