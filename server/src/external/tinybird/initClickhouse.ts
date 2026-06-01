import { type ClickHouseClient, createClient } from "@clickhouse/client";

const TINYBIRD_CLICKHOUSE_URL = process.env.TINYBIRD_US_EAST_CLICKHOUSE_URL;
const TINYBIRD_TOKEN = process.env.TINYBIRD_US_EAST_TOKEN;

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
