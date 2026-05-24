# HeatLab_v2

HeatLab_v2 is a React + Vite frontend project for recommending comfortable places to visit in Bamberg, Germany.

## Run locally

```bash
npm install
npm run dev
```

Open the local URL shown in the terminal, usually:

```text
http://localhost:5173
```

## Environment setup

Create a `.env` file in the project root:

```env
VITE_GOOGLE_PLACES_API_KEY=your_google_api_key
VITE_API_BASE_URL=http://localhost:5000

NETATMO_CLIENT_ID=your_netatmo_client_id
NETATMO_CLIENT_SECRET=your_netatmo_client_secret
NETATMO_REFRESH_TOKEN=your_netatmo_refresh_token
NETATMO_ACCESS_TOKEN=optional_existing_access_token
NETATMO_SEARCH_RADIUS_KM=10
```

## Netatmo backend

Run the local API server in one terminal:

```bash
npm run api
```

Run the React app in another terminal:

```bash
npm run dev
```

When `VITE_API_BASE_URL` is set, HeatLab requests live public Netatmo weather from `GET /api/netatmo/weather?lat=...&lng=...`. Without `VITE_API_BASE_URL`, the frontend uses mock weather for UI development.

Check whether the Netatmo credentials can refresh an access token:

```bash
npm run test:netatmo
```

Check credentials plus a public weather lookup near Bamberg:

```bash
npm run test:netatmo:weather
```
