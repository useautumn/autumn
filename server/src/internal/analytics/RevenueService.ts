import type { AutumnContext } from "@/honoUtils/HonoEnv";

export class RevenueService {
	static clickhouseAvailable =
		process.env.CLICKHOUSE_URL &&
		process.env.CLICKHOUSE_USERNAME &&
		process.env.CLICKHOUSE_PASSWORD;

	static async getMonthlyRevenue({ ctx }: { ctx: AutumnContext }) {
		const { clickhouseClient, org, env } = ctx;

		if (!clickhouseClient) throw new Error("ClickHouse client not found");

		// Pre-compute the threshold in milliseconds to avoid per-row conversion
		const query = `
SELECT
    SUM(total) AS total_payment_volume
FROM
    invoices
INNER JOIN
    customers c ON invoices.internal_customer_id = c.internal_id
WHERE
    status = 'paid'
    AND created_at >= toUnixTimestamp(subtractDays(toStartOfDay(now()), 30)) * 1000
    AND c.org_id = {org_id:String}
    AND c.env = {env:String};`;

		const result = await clickhouseClient.query({
			query,
			query_params: {
				org_id: org?.id,
				env: env,
			},
		});

		const resultJson = await result.json();

		return (
			resultJson.data as { total_payment_volume: number; label: string }[]
		)[0];
	}
}
