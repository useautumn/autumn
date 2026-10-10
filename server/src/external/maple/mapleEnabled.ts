/** Maple export is opt-in: without an ingest key nothing is marked, stamped or replaced. */
export const isMapleEnabled = Boolean(process.env.MAPLE_INGEST_KEY);
