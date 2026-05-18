import { type ClickHouseClient, createClient } from "@clickhouse/client";

/**
 * ClickHouse-direct client for Tinybird (used by analytics paths like
 * revenue analytics, getCountAndSum, getTopEventNames, etc.). During the
 * us-west → us-east cutover transition this reads from the us-east
 * workspace's ClickHouse endpoint and admin token. The legacy
 * `TINYBIRD_CLICKHOUSE_URL` / `TINYBIRD_TOKEN` env vars are ignored at
 * runtime — primary moved to TINYBIRD_US_EAST_* in `tinybirdUtils.ts` and
 * this client follows it.
 *
 * Tinybird URL pattern reference:
 *   API:        https://api.<region>.aws.tinybird.co
 *   ClickHouse: https://clickhouse.<region>.aws.tinybird.co
 */
const TINYBIRD_CLICKHOUSE_URL = process.env.TINYBIRD_US_EAST_CLICKHOUSE_URL;
const TINYBIRD_TOKEN = process.env.TINYBIRD_US_EAST_TOKEN;

const legacyClickhouseUrl = process.env.TINYBIRD_CLICKHOUSE_URL;
if (
	legacyClickhouseUrl &&
	TINYBIRD_CLICKHOUSE_URL &&
	legacyClickhouseUrl !== TINYBIRD_CLICKHOUSE_URL
) {
	console.warn(
		`[Tinybird ClickHouse] Ignoring legacy TINYBIRD_CLICKHOUSE_URL (${legacyClickhouseUrl}) — ` +
			`using TINYBIRD_US_EAST_CLICKHOUSE_URL (${TINYBIRD_CLICKHOUSE_URL}) instead.`,
	);
}

if (TINYBIRD_CLICKHOUSE_URL && TINYBIRD_TOKEN) {
	console.log(
		`[Tinybird ClickHouse] Configured with URL: ${TINYBIRD_CLICKHOUSE_URL}`,
	);
}

/** ClickHouse client for raw SQL queries to Tinybird. Null if not configured. */
export const clickhouseClient: ClickHouseClient | null =
	TINYBIRD_CLICKHOUSE_URL && TINYBIRD_TOKEN
		? createClient({
				url: TINYBIRD_CLICKHOUSE_URL,
				password: TINYBIRD_TOKEN,
			})
		: null;

/** Get ClickHouse client, throws if not configured. */
export const getClickhouseClient = (): ClickHouseClient => {
	if (!clickhouseClient) {
		throw new Error("Tinybird ClickHouse is not configured");
	}
	return clickhouseClient;
};
