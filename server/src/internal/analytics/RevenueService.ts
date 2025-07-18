import { ExtendedRequest } from "@/utils/models/Request.js";

export class RevenueService {
	static clickhouseAvailable =
		process.env.CLICKHOUSE_URL &&
		process.env.CLICKHOUSE_USERNAME &&
		process.env.CLICKHOUSE_PASSWORD;

	static async getMonthlyRevenue({ req }: { req: ExtendedRequest }) {
		const { clickhouseClient, org, env } = req;

		const query = `
SELECT
    SUM(total) AS total_payment_volume
FROM
    invoices
INNER JOIN
    customers c ON invoices.internal_customer_id = c.internal_id
WHERE
    status = 'paid'
    -- Divide by 1000 to convert from milliseconds to seconds, then cast to DateTime
    AND toDateTime(CAST(created_at AS Float64) / 1000) >= subtractDays(toStartOfDay(now()), 30)
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

        return (resultJson.data as { total_payment_volume: number, label: string }[])[0];
	}
}
