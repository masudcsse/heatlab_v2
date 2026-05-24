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
```

For now, Netatmo weather data uses a mock fallback. Later, connect `src/services/netatmoService.js` to a backend API.
