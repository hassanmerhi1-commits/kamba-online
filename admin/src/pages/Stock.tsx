import { useState } from 'react';
import { api, errorText, type StockRow } from '../lib/api';
import { useLoad } from '../lib/useLoad';

function StockEditor({ row, onSaved }: { row: StockRow; onSaved: () => void }) {
  const [value, setValue] = useState(String(row.quantity));
  const [error, setError] = useState('');

  const parsed = Number(value);
  const valid = value !== '' && Number.isInteger(parsed) && parsed >= 0;
  const changed = valid && parsed !== row.quantity;

  const save = async () => {
    try {
      await api('/api/admin/stock', {
        method: 'PUT',
        body: { product_id: row.product_id, shop_id: row.shop_id, quantity: parsed },
      });
      setError('');
      onSaved();
    } catch (err) {
      setError(errorText(err));
    }
  };

  return (
    <>
      <input
        type="number"
        min="0"
        step="1"
        value={value}
        onChange={(e) => setValue(e.target.value)}
        style={{ width: 90, borderColor: valid ? undefined : '#9b2226' }}
      />
      {changed && (
        <button className="btn btn-sm" onClick={save}>
          Save
        </button>
      )}
      {error && <span className="error small"> {error}</span>}
    </>
  );
}

export default function Stock() {
  const { data, error, reload } = useLoad<StockRow[]>('/api/admin/stock');
  const [filter, setFilter] = useState('');

  if (error) return <p className="error">{error}</p>;
  if (!data) return <p className="muted">Loading…</p>;

  const q = filter.trim().toLowerCase();
  const rows = q ? data.filter((r) => r.product.toLowerCase().includes(q) || r.sku.toLowerCase().includes(q)) : data;

  return (
    <>
      <div className="page-head">
        <h2 className="page-title">Stock by shop</h2>
        <input placeholder="Search product or SKU…" value={filter} onChange={(e) => setFilter(e.target.value)} />
      </div>
      <p className="muted" style={{ marginBottom: 16 }}>
        Only you see these numbers. Customers just see "Out of stock" when the total across all shops reaches 0.
      </p>

      <div className="card">
        <table>
          <thead>
            <tr>
              <th>Product</th>
              <th>Shop</th>
              <th>Quantity</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              // Remount when the saved quantity changes so the input resets to the server value.
              <tr key={`${r.product_id}-${r.shop_id}-${r.quantity}`}>
                <td>
                  {r.product}
                  <div className="muted small">{r.sku}</div>
                </td>
                <td>{r.shop}</td>
                <td>
                  <StockEditor row={r} onSaved={reload} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {rows.length === 0 && <p className="muted">Nothing matches "{filter}".</p>}
      </div>
    </>
  );
}
