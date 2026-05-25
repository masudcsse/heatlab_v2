import { closeDbPool, queryDb } from "./db.js";

const WEATHER_COLUMN_HINTS = [
  "time",
  "date",
  "station",
  "device",
  "module",
  "temperature",
  "temp",
  "humidity",
  "pressure",
  "co2",
  "rain",
  "wind",
];

async function inspectPostgresSchema() {
  const tablesResult = await queryDb(`
    SELECT table_schema, table_name
    FROM information_schema.tables
    WHERE table_type = 'BASE TABLE'
      AND table_schema NOT IN ('pg_catalog', 'information_schema')
    ORDER BY table_schema, table_name
  `);

  const columnsResult = await queryDb(`
    SELECT
      table_schema,
      table_name,
      column_name,
      data_type,
      udt_name,
      is_nullable
    FROM information_schema.columns
    WHERE table_schema NOT IN ('pg_catalog', 'information_schema')
    ORDER BY table_schema, table_name, ordinal_position
  `);

  const columnsByTable = columnsResult.rows.reduce((grouped, column) => {
    const key = `${column.table_schema}.${column.table_name}`;
    grouped[key] = grouped[key] || [];
    grouped[key].push(column);
    return grouped;
  }, {});

  console.log(`Found ${tablesResult.rows.length} user tables.`);

  tablesResult.rows.forEach((table) => {
    const key = `${table.table_schema}.${table.table_name}`;
    const columns = columnsByTable[key] || [];
    const likelyWeatherColumns = columns.filter((column) =>
      WEATHER_COLUMN_HINTS.some((hint) =>
        column.column_name.toLowerCase().includes(hint)
      )
    );

    console.log(`\n${key}`);
    columns.forEach((column) => {
      console.log(
        `  - ${column.column_name}: ${column.data_type} (${column.udt_name}) nullable=${column.is_nullable}`
      );
    });

    if (likelyWeatherColumns.length > 0) {
      console.log(
        `  likely weather columns: ${likelyWeatherColumns
          .map((column) => column.column_name)
          .join(", ")}`
      );
    }
  });

  await printMeasurementStats(columnsByTable["public.measurements"]);
  await printSampleRows(tablesResult.rows, columnsByTable);
}

async function printMeasurementStats(columns) {
  if (!Array.isArray(columns)) return;

  const hasTa = columns.some((column) => column.column_name === "ta");
  const hasHumidity = columns.some((column) => column.column_name === "humidity");
  if (!hasTa && !hasHumidity) return;

  const statsResult = await queryDb(`
    SELECT
      MIN(time) AS first_observation,
      MAX(time) AS last_observation,
      COUNT(*)::int AS total_records,
      COUNT(*) FILTER (WHERE ta IS NOT NULL)::int AS temperature_records,
      COUNT(*) FILTER (WHERE humidity IS NOT NULL)::int AS humidity_records,
      COUNT(DISTINCT station)::int AS station_count
    FROM public.measurements
  `);

  const stationsResult = await queryDb(`
    SELECT
      station,
      AVG(lat)::float AS lat,
      AVG(lon)::float AS lon,
      MIN(time) AS first_observation,
      MAX(time) AS last_observation,
      COUNT(*)::int AS records
    FROM public.measurements
    GROUP BY station
    ORDER BY station
  `);

  console.log("\npublic.measurements stats");
  console.log(JSON.stringify(statsResult.rows[0], null, 2));

  console.log("\npublic.measurements stations");
  console.log(JSON.stringify(stationsResult.rows, null, 2));
}

async function printSampleRows(tables, columnsByTable) {
  console.log("\nSample rows from likely weather tables:");

  for (const table of tables) {
    const key = `${table.table_schema}.${table.table_name}`;
    const columns = columnsByTable[key] || [];
    const score = columns.filter((column) =>
      WEATHER_COLUMN_HINTS.some((hint) =>
        column.column_name.toLowerCase().includes(hint)
      )
    ).length;

    if (score < 2) continue;

    const timestampColumn = columns.find((column) =>
      ["timestamp", "time", "date", "created_at", "updated_at", "ts"].some(
        (hint) => column.column_name.toLowerCase().includes(hint)
      )
    );

    const orderClause = timestampColumn
      ? `ORDER BY ${quoteIdent(timestampColumn.column_name)} DESC`
      : "";

    try {
      const sampleResult = await queryDb(
        `SELECT * FROM ${quoteIdent(table.table_schema)}.${quoteIdent(
          table.table_name
        )} ${orderClause} LIMIT 3`
      );

      console.log(`\n${key}`);
      console.log(JSON.stringify(sampleResult.rows, null, 2));
    } catch (error) {
      console.log(`\n${key}`);
      console.log(`  unable to sample rows: ${error.message}`);
    }
  }
}

function quoteIdent(identifier) {
  return `"${String(identifier).replaceAll('"', '""')}"`;
}

inspectPostgresSchema()
  .catch((error) => {
    console.error(`Database schema inspection failed: ${error.message}`);
    process.exitCode = 1;
  })
  .finally(async () => {
    await closeDbPool();
  });
