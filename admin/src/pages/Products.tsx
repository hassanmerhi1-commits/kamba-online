import { useState, type ChangeEvent, type FormEvent } from 'react';
import { api, errorText, formatKz, imageSrc, uploadImage, type AdminProduct, type Category } from '../lib/api';
import { prepareImage } from '../lib/image';
import { useLoad } from '../lib/useLoad';

interface FormState {
  sku: string;
  name_pt: string;
  name_en: string;
  description_pt: string;
  description_en: string;
  price: string;
  unit: string;
  category_id: string;
  image_url: string | null;
}

const emptyForm: FormState = {
  sku: '',
  name_pt: '',
  name_en: '',
  description_pt: '',
  description_en: '',
  price: '',
  unit: 'un',
  category_id: '',
  image_url: null,
};

const fromProduct = (p: AdminProduct): FormState => ({
  sku: p.sku,
  name_pt: p.name_pt,
  name_en: p.name_en,
  description_pt: p.description_pt,
  description_en: p.description_en,
  price: String(p.price),
  unit: p.unit,
  category_id: p.category_id ?? '',
  image_url: p.image_url,
});

function ProductForm({
  product,
  categories,
  onSaved,
  onCancel,
}: {
  product: AdminProduct | null; // null = new product
  categories: Category[];
  onSaved: () => void;
  onCancel: () => void;
}) {
  const [form, setForm] = useState<FormState>(product ? fromProduct(product) : emptyForm);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [uploading, setUploading] = useState(false);

  const set = (field: keyof FormState) => (e: { target: { value: string } }) =>
    setForm((f) => ({ ...f, [field]: e.target.value }));

  const pickPhoto = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    setUploading(true);
    setError('');
    try {
      const url = await uploadImage(await prepareImage(file));
      setForm((f) => ({ ...f, image_url: url }));
    } catch (err) {
      setError(errorText(err));
    } finally {
      setUploading(false);
    }
  };

  const save = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError('');
    const body = {
      name_pt: form.name_pt,
      name_en: form.name_en,
      description_pt: form.description_pt,
      description_en: form.description_en,
      price: Number(form.price),
      unit: form.unit || 'un',
      category_id: form.category_id || null,
      image_url: form.image_url,
    };
    try {
      if (product) {
        await api(`/api/admin/products/${product.id}`, { method: 'PUT', body });
      } else {
        await api('/api/admin/products', {
          method: 'POST',
          body: { ...body, sku: form.sku, category_id: form.category_id || undefined, image_url: form.image_url ?? undefined },
        });
      }
      onSaved();
    } catch (err) {
      setError(errorText(err));
    } finally {
      setBusy(false);
    }
  };

  const remove = async () => {
    if (!product) return;
    const ok = window.confirm(
      `Delete "${product.name_pt}" for good?\n\nPast orders keep their record. If you only want to stop selling it for now, use "Hide from customers" instead.`
    );
    if (!ok) return;
    try {
      await api(`/api/admin/products/${product.id}`, { method: 'DELETE' });
      onSaved();
    } catch (err) {
      setError(errorText(err));
    }
  };

  const photo = imageSrc(form.image_url);

  return (
    <form className="card" onSubmit={save}>
      <h3 style={{ marginBottom: 14 }}>{product ? `Edit: ${product.name_pt}` : 'New product'}</h3>

      <div className="photo-row">
        <div className="photo-box">{photo ? <img src={photo} alt="" /> : <span className="muted small">No photo</span>}</div>
        <div>
          <label className="btn btn-sm btn-outline file-btn">
            {uploading ? 'Uploading…' : photo ? 'Change photo' : 'Add photo'}
            <input type="file" accept="image/*" onChange={pickPhoto} disabled={uploading} hidden />
          </label>
          {photo && (
            <button type="button" className="btn btn-sm btn-outline" onClick={() => setForm((f) => ({ ...f, image_url: null }))}>
              Remove photo
            </button>
          )}
          <p className="muted small" style={{ marginTop: 6 }}>
            Any phone or camera photo works. It is resized automatically.
          </p>
        </div>
      </div>

      <div className="grid-form">
        <label>
          SKU (product code)
          <input value={form.sku} onChange={set('sku')} required disabled={!!product} placeholder="e.g. DET-010" />
        </label>
        <label>
          Category
          <select value={form.category_id} onChange={set('category_id')}>
            <option value="">No category</option>
            {categories.map((c) => (
              <option key={c.id} value={c.id}>{c.name_pt}</option>
            ))}
          </select>
        </label>
        <label>
          Name (Português)
          <input value={form.name_pt} onChange={set('name_pt')} required />
        </label>
        <label>
          Name (English)
          <input value={form.name_en} onChange={set('name_en')} required />
        </label>
        <label>
          Price (Kz)
          <input type="number" min="0" step="any" value={form.price} onChange={set('price')} required />
        </label>
        <label>
          Unit
          <input value={form.unit} onChange={set('unit')} maxLength={20} placeholder="un, kg, caixa…" />
        </label>
        <label>
          Description (Português)
          <textarea value={form.description_pt} onChange={set('description_pt')} rows={3} />
        </label>
        <label>
          Description (English)
          <textarea value={form.description_en} onChange={set('description_en')} rows={3} />
        </label>
      </div>

      {error && <p className="error">{error}</p>}
      <div className="form-row" style={{ marginTop: 12 }}>
        <button className="btn" type="submit" disabled={busy || uploading}>
          {busy ? 'Saving…' : product ? 'Save changes' : 'Add product'}
        </button>
        <button className="btn btn-outline" type="button" onClick={onCancel}>Cancel</button>
        {product && (
          <button className="btn btn-danger" type="button" onClick={remove} style={{ marginLeft: 'auto' }}>
            Delete product
          </button>
        )}
      </div>
      {!product && (
        <p className="muted small" style={{ marginTop: 8 }}>
          New products start with no stock. Add quantities on the Stock page so customers can order them.
        </p>
      )}
    </form>
  );
}

function Categories({ categories, onChanged }: { categories: Category[]; onChanged: () => void }) {
  const [names, setNames] = useState({ name_pt: '', name_en: '' });
  const [error, setError] = useState('');

  const run = async (fn: () => Promise<unknown>) => {
    try {
      await fn();
      setError('');
      onChanged();
    } catch (err) {
      setError(errorText(err));
    }
  };

  const add = (e: FormEvent) => {
    e.preventDefault();
    run(async () => {
      await api('/api/admin/categories', { method: 'POST', body: names });
      setNames({ name_pt: '', name_en: '' });
    });
  };

  const rename = (c: Category) => {
    const pt = window.prompt('Name (Português)', c.name_pt);
    if (pt === null || !pt.trim()) return;
    const en = window.prompt('Name (English)', c.name_en);
    if (en === null || !en.trim()) return;
    run(() => api(`/api/admin/categories/${c.id}`, { method: 'PUT', body: { name_pt: pt, name_en: en } }));
  };

  const remove = (c: Category) => {
    if (!window.confirm(`Delete category "${c.name_pt}"? Its products stay, but with no category.`)) return;
    run(() => api(`/api/admin/categories/${c.id}`, { method: 'DELETE' }));
  };

  return (
    <div className="card">
      <h3 style={{ marginBottom: 12 }}>Categories</h3>
      <div className="chips">
        {categories.map((c) => (
          <span className="chip" key={c.id}>
            {c.name_pt} <span className="muted small">/ {c.name_en}</span>
            <button type="button" title="Rename" onClick={() => rename(c)}>✎</button>
            <button type="button" title="Delete" onClick={() => remove(c)}>✕</button>
          </span>
        ))}
        {categories.length === 0 && <span className="muted">No categories yet.</span>}
      </div>
      <form className="form-row" onSubmit={add} style={{ marginTop: 12 }}>
        <input placeholder="New category (Português)" value={names.name_pt} onChange={(e) => setNames((n) => ({ ...n, name_pt: e.target.value }))} required />
        <input placeholder="New category (English)" value={names.name_en} onChange={(e) => setNames((n) => ({ ...n, name_en: e.target.value }))} required />
        <button className="btn btn-sm" type="submit">+ Add category</button>
      </form>
      {error && <p className="error">{error}</p>}
    </div>
  );
}

export default function Products() {
  const products = useLoad<AdminProduct[]>('/api/admin/products');
  const categories = useLoad<Category[]>('/api/categories');
  const [editing, setEditing] = useState<AdminProduct | 'new' | null>(null);
  const [filter, setFilter] = useState('');
  const [error, setError] = useState('');

  const toggle = async (p: AdminProduct) => {
    try {
      await api(`/api/admin/products/${p.id}`, { method: 'PUT', body: { is_active: !p.is_active } });
      setError('');
      await products.reload();
    } catch (err) {
      setError(errorText(err));
    }
  };

  if (products.error) return <p className="error">{products.error}</p>;
  if (!products.data) return <p className="muted">Loading…</p>;

  const cats = categories.data ?? [];
  const catName = (id: string | null) => cats.find((c) => c.id === id)?.name_pt ?? '—';
  const q = filter.trim().toLowerCase();
  const rows = q
    ? products.data.filter((p) => [p.name_pt, p.name_en, p.sku].some((s) => s.toLowerCase().includes(q)))
    : products.data;

  const done = async () => {
    setEditing(null);
    await products.reload();
  };

  return (
    <>
      <div className="page-head">
        <h2 className="page-title">Products</h2>
        <div>
          <input placeholder="Search name or SKU…" value={filter} onChange={(e) => setFilter(e.target.value)} />
          <button className="btn" onClick={() => setEditing('new')}>+ New product</button>
        </div>
      </div>
      {error && <p className="error">{error}</p>}

      {editing && (
        <ProductForm
          key={editing === 'new' ? 'new' : editing.id}
          product={editing === 'new' ? null : editing}
          categories={cats}
          onSaved={done}
          onCancel={() => setEditing(null)}
        />
      )}

      <div className="card">
        <table>
          <thead>
            <tr>
              <th></th>
              <th>Name</th>
              <th>Category</th>
              <th>Price</th>
              <th>Total stock</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {rows.map((p) => {
              const photo = imageSrc(p.image_url);
              return (
                <tr key={p.id} style={p.is_active ? undefined : { opacity: 0.55 }}>
                  <td style={{ width: 56 }}>
                    <div className="thumb">{photo ? <img src={photo} alt="" /> : null}</div>
                  </td>
                  <td>
                    {p.name_pt}
                    <div className="muted small">{p.name_en} · {p.sku}</div>
                  </td>
                  <td>{catName(p.category_id)}</td>
                  <td>{formatKz(p.price)}</td>
                  <td style={{ fontWeight: 600, color: p.total_stock === 0 ? '#9b2226' : undefined }}>
                    {p.total_stock === 0 ? 'Out of stock' : p.total_stock}
                  </td>
                  <td style={{ whiteSpace: 'nowrap' }}>
                    <button className="btn btn-sm" onClick={() => setEditing(p)}>Edit</button>
                    <button className="btn btn-sm btn-outline" onClick={() => toggle(p)}>
                      {p.is_active ? 'Hide from customers' : 'Show to customers'}
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        {rows.length === 0 && <p className="muted" style={{ marginTop: 8 }}>{q ? `Nothing matches "${filter}".` : 'No products yet. Click "+ New product".'}</p>}
        <p className="muted small" style={{ marginTop: 12 }}>
          {products.data.length} products · prices in Kz
        </p>
      </div>

      <Categories categories={cats} onChanged={categories.reload} />
    </>
  );
}
