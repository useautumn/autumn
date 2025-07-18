import { ExtendedRequest } from "@/utils/models/Request.js";

export class RevenueService {
	static clickhouseAvailable =
		process.env.CLICKHOUSE_URL &&
		process.env.CLICKHOUSE_USERNAME &&
		process.env.CLICKHOUSE_PASSWORD;

	static async getMonthlyRevenue({ req }: { req: ExtendedRequest }) {
		const { clickhouseClient, org, env } = req;

		const query = `
WITH toUnixTimestamp(created_at / 1000) AS timestamp,
     toMonth(toDateTime(timestamp)) AS month,
     toYear(toDateTime(timestamp)) AS year
SELECT
    SUM(total) AS total_payment_volume,
    concat(toString(month), '/', toString(year)) AS label
FROM invoices
INNER JOIN customers c ON invoices.internal_customer_id = c.internal_id
WHERE status = 'paid'
  AND year = toYear(now())
  AND month = toMonth(now())
  AND c.org_id = {org_id:String}
  AND c.env = {env:String}
GROUP BY month, year
ORDER BY year DESC, month DESC
LIMIT 1;`;

        const result = await clickhouseClient.query({
            query,
            query_params: {
                org_id: org?.id,
                env: env,
            },
        });

        const resultJson = await result.json();

        return (resultJson.data as { total_payment_volume: number, label: string }[])[0];
	}
}
