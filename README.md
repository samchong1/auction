# Single-Product Auction (Assessment)

This workspace contains a minimal implementation of a single-product auction with real-time bidding using NestJS, TypeORM (MySQL), and a React + TypeScript frontend.

## Structure
- `backend/` - NestJS backend with TypeORM entities, auction service, and WebSocket gateway
- `frontend/` - Vite + React frontend with auction UI and socket.io client

## Run (local dev)

Prerequisites: Node.js, MySQL running locally.

1. Start MySQL and create database:

```sql
CREATE DATABASE IF NOT EXISTS auction_db;
```

2. Backend

```bash
cd backend
npm install
# set env vars if needed (DB_HOST, DB_PORT, DB_USER, DB_PASS, DB_NAME)
npm run start:dev
```

3. Frontend

```bash
cd frontend
npm install
# copy .env.example to .env and update values if needed
npm run dev
```

The backend listens on `http://localhost:3001` by default and exposes a WebSocket server (socket.io). The frontend uses `VITE_BACKEND_URL` and optionally `VITE_SOCKET_URL` to connect to the backend.

## Architectural Decisions
- WebSocket (socket.io) chosen for low-latency bid broadcasting to many clients and ease of integration with NestJS.
- Server-managed timer: the server sets `timerStartsAt` / `timerEndsAt` and enforces auction start/end using a server-side timer to prevent client clock tampering and to be the source of truth.
- State handling: auction lifecycle is derived from timer fields rather than a separate status flag; server broadcasts `bid_updated` and `auction_ended` events so clients render the three states (BEFORE, DURING, END).
- Bid validation: the backend now accepts integer-only bid amounts and the frontend enforces whole-number bid input.

## Future Improvements
- Add authentication/identity to tie bids to users securely.
- Add unit/integration tests for bidding rules and timer edge cases.
- Improve frontend styling to match wireframes and accessibility checks.
