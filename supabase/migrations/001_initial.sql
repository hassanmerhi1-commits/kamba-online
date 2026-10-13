-- Kamba Online — initial schema

create extension if not exists "uuid-ossp";

-- Profiles (extends Supabase auth.users)
create table profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  full_name text not null,
  phone text,
  is_admin boolean default false,
  created_at timestamptz default now()
);

-- Categories
create table categories (
  id uuid primary key default uuid_generate_v4(),
  name_pt text not null,
  name_en text not null,
  icon text,
  sort_order int default 0,
  created_at timestamptz default now()
);

-- Products
create table products (
  id uuid primary key default uuid_generate_v4(),
  sku text unique not null,
  name_pt text not null,
  name_en text not null,
  description_pt text default '',
  description_en text default '',
  price numeric(12,2) not null,
  category_id uuid references categories(id) on delete set null,
  image_url text,
  unit text default 'un',
  is_active boolean default true,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- Shop locations (display only — 6 stores in Soyo)
create table shop_locations (
  id uuid primary key default uuid_generate_v4(),
  name text not null,
  address text not null,
  phone text not null,
  latitude numeric(10,7) not null,
  longitude numeric(10,7) not null,
  is_active boolean default true,
  created_at timestamptz default now()
);

-- Stock per shop (never exposed to customers)
create table stock (
  id uuid primary key default uuid_generate_v4(),
  product_id uuid not null references products(id) on delete cascade,
  shop_id uuid not null references shop_locations(id) on delete cascade,
  quantity int not null default 0 check (quantity >= 0),
  updated_at timestamptz default now(),
  unique (product_id, shop_id)
);

-- Orders (all go to main office)
create table orders (
  id uuid primary key default uuid_generate_v4(),
  user_id uuid references auth.users(id) on delete set null,
  guest_name text,
  guest_phone text,
  items jsonb not null,
  total numeric(12,2) not null,
  payment_method text not null check (payment_method in ('cash','transfer','multicaixa','other')),
  fulfillment_type text not null check (fulfillment_type in ('delivery','pickup')),
  delivery_address text,
  status text not null default 'pending' check (status in ('pending','confirmed','preparing','ready','delivered','cancelled')),
  notes text,
  created_at timestamptz default now()
);

-- RLS
alter table profiles enable row level security;
alter table categories enable row level security;
alter table products enable row level security;
alter table shop_locations enable row level security;
alter table stock enable row level security;
alter table orders enable row level security;

-- Public read for catalog
create policy "Categories are public" on categories for select using (true);
create policy "Active products are public" on products for select using (is_active = true);
create policy "Active shops are public" on shop_locations for select using (is_active = true);

-- Users can read own profile
create policy "Users read own profile" on profiles for select using (auth.uid() = id);
create policy "Users update own profile" on profiles for update using (auth.uid() = id);

-- Users can create orders
create policy "Anyone can create orders" on orders for insert with check (true);
create policy "Users read own orders" on orders for select using (
  auth.uid() = user_id or user_id is null
);

-- Admin policies (service role bypasses RLS; for admin app use service key or admin flag)
create policy "Admins manage products" on products for all using (
  exists (select 1 from profiles where id = auth.uid() and is_admin = true)
);
create policy "Admins manage stock" on stock for all using (
  exists (select 1 from profiles where id = auth.uid() and is_admin = true)
);
create policy "Admins manage orders" on orders for all using (
  exists (select 1 from profiles where id = auth.uid() and is_admin = true)
);
create policy "Admins manage shops" on shop_locations for all using (
  exists (select 1 from profiles where id = auth.uid() and is_admin = true)
);
create policy "Admins manage categories" on categories for all using (
  exists (select 1 from profiles where id = auth.uid() and is_admin = true)
);

-- Stock is never public — no select policy for anon/authenticated customers
-- Admin app uses admin login with is_admin = true

-- Auto-create profile on signup
create or replace function handle_new_user()
returns trigger as $$
begin
  insert into profiles (id, full_name, phone)
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'full_name', ''),
    coalesce(new.raw_user_meta_data->>'phone', '')
  );
  return new;
end;
$$ language plpgsql security definer;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function handle_new_user();

-- Helper: total stock for a product (admin only via direct query)
create or replace function get_product_stock(p_product_id uuid)
returns int as $$
  select coalesce(sum(quantity), 0)::int from stock where product_id = p_product_id;
$$ language sql stable security definer;
