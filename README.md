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

DB_HOST=your_postgres_host
DB_NAME=netatmo_raw_db
DB_USER=your_readonly_database_user
DB_PASSWORD=your_database_password
DB_PORT=5432
DB_SSL=false
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

## Historical weather comparison

HeatLab also reads historical weather from PostgreSQL through the local backend.
Database credentials stay in `.env` on the server side only and are never exposed
to the React frontend.

Inspect the available schema, stations, and date range:

```bash
npm run inspect:db
```

Available API endpoints:

```text
GET /api/historical-weather/options
GET /api/historical-weather/compare?metric=temperature&lat=49.8988&lng=10.9028&date=2026-05-25&rangeDays=7
```

In the UI, the graph does not show extra station/date/metric controls. It uses
the place selected in the top search box, chooses the nearest historical station
from `public.measurements`, and displays a 7-day temperature comparison.

The current schema uses `public.measurements`:

```text
time        timestamp with time zone
station     text
lat/lon     double precision
ta          numeric temperature in Celsius
humidity    numeric relative humidity percentage
```

Example query pattern used by the backend:

```sql
SELECT
  date_trunc('hour', time) AS time,
  AVG("ta")::float AS value,
  COUNT(*)::int AS sample_count
FROM public.measurements
WHERE time >= $1
  AND time < $2
  AND "ta" IS NOT NULL
  AND ($3::text IS NULL OR station = $3)
GROUP BY date_trunc('hour', time)
ORDER BY date_trunc('hour', time);
```

For each selected period, the backend runs this query for the selected year and
the same period 1, 2, and 3 years earlier. The API then aligns the timestamps
back onto the selected current-year x-axis so matching dates and hours line up
in the chart.
