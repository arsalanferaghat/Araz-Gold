# GoldTrade – prototype
A Persian RTL responsive frontend prototype for a gold trading/accounting system.

## Run
Open `index.html` in a browser, or publish this folder with GitHub Pages.

## Current demo capabilities
- Dashboard and local demo transaction ledger
- Buy/sell entry with basic balance check
- Gold calculator
- Manually entered Iranian 18k price
- Responsive Persian RTL interface

## Important limitations
This is a frontend prototype only. Data is stored in the current browser's localStorage and is not shared between users/devices. It has no authentication, server database, live price feed, payment gateway, legal trading integration, or real order execution. Do not use it for real-money transactions.

## Next implementation stage
Connect Supabase Auth + PostgreSQL with Row Level Security, create an immutable double-entry ledger and audit log, then add trusted market-data providers and a legally approved Iranian payment/settlement provider. Keep all privileged keys server-side.
