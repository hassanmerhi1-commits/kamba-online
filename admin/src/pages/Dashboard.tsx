import { formatKz, type Order, type Summary } from '../lib/api';
import { useCan, useMe } from '../lib/auth';
import { useLoad } from '../lib/useLoad';

function LatestOrders() {
  const orders = useLoad<Order[]>('/api/admin/orders');
  return (
    <div className="card">
      <h3 style={{ marginBottom: 12 }}>Latest orders</h3>
      {orders.error && <p className="error">{orders.error}</p>}
      {orders.data && orders.data.length === 0 && <p className="muted">No orders yet.</p>}
      {orders.data && orders.data.length > 0 && (
        <table>
          <thead>
            <tr>
              <th>Order</th>
              <th>Customer</th>
              <th>Total</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>
            {orders.data.slice(0, 5).map((o) => (
              <tr key={o.id}>
                <td>{o.id}</td>
                <td>{o.customer_name}</td>
                <td>{formatKz(o.total)}</td>
                <td>
                  <span className={`badge badge-${o.status}`}>{o.status}</span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}

export default function Dashboard() {
  const me = useMe();
  const can = useCan();
  const summary = useLoad<Summary>('/api/admin/summary');

  if (summary.error) return <p className="error">{summary.error}</p>;
  if (!summary.data) return <p className="muted">Loading…</p>;
  const s = summary.data;

  return (
    <>
      <h2 className="page-title">Hello, {me.full_name}</h2>
      <div className="stat-grid">
        <div className="stat">
          <div className="stat-value">{formatKz(s.sales_today)}</div>
          <div className="stat-label">Sales today</div>
        </div>
        <div className="stat">
          <div className="stat-value">{s.pending_orders}</div>
          <div className="stat-label">Pending orders</div>
        </div>
        <div className="stat">
          <div className="stat-value">{s.low_stock_products}</div>
          <div className="stat-label">Products low on stock (&lt; 10)</div>
        </div>
        <div className="stat">
          <div className="stat-value">{s.products}</div>
          <div className="stat-label">Active products</div>
        </div>
        <div className="stat">
          <div className="stat-value">{s.shops}</div>
          <div className="stat-label">Shop locations</div>
        </div>
      </div>

      {can('orders') && <LatestOrders />}
    </>
  );
}
