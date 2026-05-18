import { type ClickHouseClient, createClient } from "@clickhouse/client";

const primaryClickhouseUrl = process.env.TINYBIRD_US_EAST_CLICKHOUSE_URL;
const primaryToken = process.env.TINYBIRD_US_EAST_TOKEN;

const safeOrigin = (url: string): string | null => {
	try {
		return new URL(url).origin;
	} catch {
		return null;
	}
};

const legacyClickhouseUrl = process.env.TINYBIRD_CLICKHOUSE_URL;
const legacyOrigin = legacyClickhouseUrl
	? safeOrigin(legacyClickhouseUrl)
	: null;
const primaryOrigin = primaryClickhouseUrl
	? safeOrigin(primaryClickhouseUrl)
	: null;
if (legacyOrigin && primaryOrigin && legacyOrigin !== primaryOrigin) {
	console.warn(
		`[Tinybird ClickHouse] Ignoring legacy TINYBIRD_CLICKHOUSE_URL (${legacyClickhouseUrl}) — ` +
			`using TINYBIRD_US_EAST_CLICKHOUSE_URL (${primaryClickhouseUrl}) instead.`,
	);
}

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
