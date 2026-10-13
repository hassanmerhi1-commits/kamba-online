# Kamba Online

Online shop for Soyo, Angola. Everything runs on this computer.

## Install the desktop app (for testing client + admin)

Run `Kamba Online Setup.exe` (on the Desktop, or `desktop/release/`). Then open **Kamba Online** from the Desktop or Start menu.
It opens two windows:

- **Cliente** - the customer shop
- **Admin** - the behind-the-scenes panel. First login: `admin` / `kamba2026` (the owner). Change it under **My account**.

Menu "Kamba Online": switch windows (Ctrl+1 / Ctrl+2), open the data folder,
**Reset test data** (back to the sample products), **Start clean** (wipe everything, no sample data, for real data).
Data is stored in `%APPDATA%\Kamba Online\` (`kamba.db` and the `uploads` photos folder).

## What the admin controls

| Page | What it does | Permission |
|---|---|---|
| Orders | See orders, change status, cancel (stock goes back to the shops it came from) | orders |
| Products | Add / edit / delete products, upload photos, categories, hide from customers | products |
| Stock | Quantity of each product in each shop (customers never see it) | stock |
| Locations | Add / edit / switch off the shop locations shown to customers | shops |
| WhatsApp & phone | The number customers send WhatsApp orders to, and the office phone | settings |
| Printer | Choose the thermal printer, auto-print on/off, copies, slip title, test slip | settings |
| Team | Create staff logins and choose what each can do. Switch off, reset password | owner only |
| My account | Change own password | everyone |

The owner can do everything. Staff only see the pages they were given.

Rules:
- A cancelled order returns its items to stock once and cannot be reopened. A delivered order cannot be cancelled.
- A switched-off shop's stock does not count as available.
- Until a WhatsApp number is set, the WhatsApp buttons are hidden in the customer app.

## Printing the order slip (Xprinter, USB, 80 mm)

1. Plug in the Xprinter, switch it on, install its Windows driver (it then shows up in Windows Printers).
2. In the admin: **Printer** -> choose it -> leave "Print automatically" on -> **Save & print test slip**.
3. From then on every new order prints an internal slip: order number, customer, delivery/pickup, payment, items with SKU,
   total, which shop the stock was taken from, notes. It says "Documento interno - sem valor fiscal" (it is NOT a legal invoice).
4. **Orders** shows Printed / Not printed and has a Print / Reprint button.

Notes: the app must be open on the office computer. If the printer is off or out of paper the order is still saved
(shown as "Not printed") and can be reprinted. If Windows marks the printer offline, slips wait in the Windows queue.
The slip is sent as raw ESC/POS (48 columns, code page 850 for Portuguese accents).

## Online updates

Code: https://github.com/hassanmerhi1-commits/kamba-online (public). The installed app checks GitHub Releases
15 seconds after start and every 4 hours, downloads a newer version in the background, and asks "Restart now / Later"
(Later = installs when the app is closed). Orders, products, photos and settings are kept. Menu: Kamba Online ->
"Check for updates...".

Publish a new version (from `desktop/`):

```powershell
npm version patch --no-git-tag-version   # 1.1.0 -> 1.1.1
npm run release                          # builds, pushes to GitHub, publishes the release
```

Uploading the ~97 MB installer can take several minutes on a slow connection.
Needs `gh auth login` done once (the release script ignores an invalid `GH_TOKEN` variable).
Versions before 1.1.0 cannot update themselves: install 1.1.0 once, then updates are automatic.

## Build the installer only (no publishing)

```powershell
cd desktop
npm run dist
```

This builds the customer app and admin, then writes `desktop/release/Kamba-Online-Setup-<version>.exe`.

## Developer mode (three terminals, live reload)

```powershell
cd server; npm start                              # API  http://localhost:3001
cd admin;  npm run dev                            # admin http://localhost:5173
cd mobile; npx expo start --web --port 8081       # shop  http://localhost:8081
```

Tests: `cd server; npm test` (70 tests)

## Structure

| Folder | What |
|---|---|
| `server/` | Node + SQLite API (also serves the built shop at `/`, admin at `/admin`, photos at `/uploads`) |
| `mobile/` | Customer app (Expo / React Native, runs on web today) |
| `admin/` | Admin panel (Vite + React) |
| `desktop/` | Windows installer wrapper (Electron) |

## Rules built in

- Customers never see stock numbers, only "Esgotado" when unavailable.
- Stock is kept per shop; orders take from the shops with the most stock.
- Prices always come from the database.
- All orders go to one main office; the shops are shown as locations only.
- Portuguese default, English second (PT | EN switch on the home page).

## Not done yet

Phone store apps (later phase). `supabase/` is the old cloud design and is no longer used.
