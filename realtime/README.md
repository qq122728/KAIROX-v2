# FluxPerp Realtime

The app uses two channels:

- HTTP: Next.js API routes on `http://127.0.0.1:3000`
- WebSocket: Socket.IO service on `http://127.0.0.1:3001`

Run them in two terminals:

```bash
npm run dev
npm run socket
npm run settlement
```

Install the socket dependency first:

```bash
npm install socket.io
```

Events currently emitted:

- `admin:update`: admin dashboard should reload overview data.
- `user:update`: a single user's browser should reload account/assets/orders.
- `binary:created`: user opened a binary option order.
- `binary:settled`: admin settled a binary option order.
- `deposit:created` / `deposit:update`: sent through `admin:update` and `user:update` payloads.
- `kyc:created` / `kyc:update`: sent through `admin:update` and `user:update` payloads.
- `deposit-addresses:update`: default or custom deposit address changed.
- `settings:update`: system settings changed.
- `market:update`: market parameters or manual price changed.

Rooms:

- `admin`
- `user:{id}`
