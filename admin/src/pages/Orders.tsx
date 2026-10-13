import { useState } from 'react';
import { api, errorText, formatKz, type Order } from '../lib/api';
import { useLoad } from '../lib/useLoad';

const STATUSES = ['pending', 'confirmed', 'preparing', 'ready', 'delivered', 'cancelled'];

export default function Orders() {
  const { data, error, reload } = useLoad<Order[]>('/api/admin/orders');
  const [filter, setFilter] = useState('');
  const [actionError, setActionError] = useState('');
  const [notice, setNotice] = useState('');
  const [printing, setPrinting] = useState('');

  const setStatus = async (order: Order, status: string) => {
    if (status === 'cancelled') {
      const ok = window.confirm(
        `Cancel order ${order.id}?\n\nThe items go back into stock. A cancelled order cannot be reopened.`
      );
      if (!ok) return;
    }
    try {
      await api(`/api/admin/orders/${encodeURIComponent(order.id)}`, { method: 'PATCH', body: { status } });
      setActionError('');
      setNotice(status === 'cancelled' ? `Order ${order.id} cancelled. Its items are back in stock.` : '');
      await reload();
    } catch (err) {
      setActionError(errorText(err));
      setNotice('');
      await reload();
    }
  };

  const printOrder = async (order: Order) => {
    setPrinting(order.id);
    try {
      await api(`/api/admin/orders/${encodeURIComponent(order.id)}/print`, { method: 'POST' });
      setActionError('');
      setNotice(`Slip for order ${order.id} sent to the printer.`);
    } catch (err) {
      setActionError(errorText(err));
      setNotice('');
    } finally {
      setPrinting('');
      await reload();
    }
  };

  if (error) return <p className="error">{error}</p>;
  if (!data) return <p className="muted">Loading…</p>;

  const shown = filter ? data.filter((o) => o.status === filter) : data;

  return (
    <>
      <div className="page-head">
        <h2 className="page-title">Orders</h2>
        <div>
          <select value={filter} onChange={(e) => setFilter(e.target.value)}>
            <option value="">All statuses</option>
            {STATUSES.map((s) => (
              <option key={s} value={s}>{s}</option>
            ))}
          </select>
          <button className="btn btn-sm" onClick={reload}>Refresh</button>
        </div>
      </div>
      {actionError && <p className="error">{actionError}</p>}
      {notice && <p className="ok">{notice}</p>}

      <div className="card">
        {shown.length === 0 ? (
          <p className="muted">No orders{filter ? ` with status "${filter}"` : ' yet'}.</p>
        ) : (
          <table>
            <thead>
              <tr>
                <th>Order</th>
                <th>Customer</th>
                <th>Items</th>
                <th>Total</th>
                <th>How</th>
                <th>Status</th>
                <th>Slip</th>
              </tr>
            </thead>
            <tbody>
              {shown.map((o) => (
                <tr key={o.id} style={o.status === 'cancelled' ? { opacity: 0.6 } : undefined}>
                  <td>
                    {o.id}
                    <div className="muted small">{new Date(o.created_at).toLocaleString()}</div>
                  </td>
                  <td>
                    {o.customer_name}
                    <div className="muted small">{o.customer_phone}</div>
                  </td>
                  <td>
                    {o.items.map((i) => (
                      <div key={i.product_id}>
                        {i.quantity} × {i.product_name}
                      </div>
                    ))}
                    {o.notes && <div className="muted small">Note: {o.notes}</div>}
                  </td>
                  <td>{formatKz(o.total)}</td>
                  <td>
                    {o.fulfillment_type}
                    {o.delivery_address && <div className="muted small">{o.delivery_address}</div>}
                    <div className="muted small">{o.payment_method}</div>
                  </td>
                  <td>
                    {o.status === 'cancelled' ? (
                      <>
                        <span className="badge badge-cancelled">cancelled</span>
                        <div className="muted small">Stock returned</div>
                      </>
                    ) : (
                      <select value={o.status} onChange={(e) => setStatus(o, e.target.value)}>
                        {STATUSES.filter((s) => !(s === 'cancelled' && o.status === 'delivered')).map((s) => (
                          <option key={s} value={s}>{s}</option>
                        ))}
                      </select>
                    )}
                  </td>
                  <td>
                    <div className="muted small">
                      {o.printed_at ? `Printed ${new Date(o.printed_at).toLocaleTimeString()}` : 'Not printed'}
                    </div>
                    <button className="btn btn-sm" disabled={printing === o.id} onClick={() => printOrder(o)}>
                      {printing === o.id ? 'Printing…' : o.printed_at ? 'Reprint' : 'Print'}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </>
  );
}
