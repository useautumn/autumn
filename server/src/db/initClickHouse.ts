import { ClickHouseClient, createClient } from "@clickhouse/client";

export const clickhouseClient: ClickHouseClient = createClient({
	url: process.env.CLICKHOUSE_URL!,
	username: process.env.CLICKHOUSE_USERNAME!,
	password: process.env.CLICKHOUSE_PASSWORD!,
	max_open_connections: 10,
});
