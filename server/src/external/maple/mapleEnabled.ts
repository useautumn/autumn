/** Maple export is opt-in: without an ingest key no trace is marked and no log line is replaced. */
export const isMapleEnabled = Boolean(process.env.MAPLE_INGEST_KEY);
