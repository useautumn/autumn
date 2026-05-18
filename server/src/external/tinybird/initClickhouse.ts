import { type ClickHouseClient, createClient } from "@clickhouse/client";

// ClickHouse URL is different from API URL
// API: https://api.europe-west2.gcp.tinybird.co
// ClickHouse: https://europe-west2.gcp.clickhouse.tinybird.co
const primaryClickhouseUrl = process.env.TINYBIRD_US_EAST_CLICKHOUSE_URL;
const primaryToken = process.env.TINYBIRD_US_EAST_TOKEN;

if (primaryClickhouseUrl && primaryToken) {
	console.log(
		`[Tinybird ClickHouse] Configured with URL: ${primaryClickhouseUrl}`,
	);
}

/** ClickHouse client for raw SQL queries to Tinybird. Null if not configured. */
export const clickhouseClient: ClickHouseClient | null =
	primaryClickhouseUrl && primaryToken
		? createClient({
				url: primaryClickhouseUrl,
				password: primaryToken,
			})
		: null;

/** Get ClickHouse client, throws if not configured. */
export const getClickhouseClient = (): ClickHouseClient => {
	if (!clickhouseClient) {
		throw new Error("Tinybird ClickHouse is not configured");
	}
	return clickhouseClient;
};
