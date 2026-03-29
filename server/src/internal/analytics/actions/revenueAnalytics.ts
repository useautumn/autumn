import type { ClickHouseResult } from "@autumn/shared";
import { getClickhouseClient } from "@/external/tinybird/initClickhouse.js";
import type { AutumnContext } from "@/honoUtils/HonoEnv.js";

// ── Exported row types ───────────────────────────────────────────────

export type RevenueByProductRow = {
	period_label: string;
	product_name: string;
	volume: number;
	currency: string;
};

export type ProductShareRow = {
	product_name: string;
	volume: number;
	currency: string;
};

export type ArpcRow = {
	period_label: string;
	arpc: number;
	customer_count: number;
	currency: string;
};

export type InvoiceStatusRow = {
	status: string;
	invoice_count: number;
	total_volume: number;
	currency: string;
};

export type CustomerLeaderboardRow = {
	internal_customer_id: string;
	customer_name: string | null;
	customer_id: string | null;
	customer_email: string | null;
	total_volume: number;
	invoice_count: number;
	currency: string;
};

// ── Helpers ──────────────────────────────────────────────────────────

const GRANULARITY_FORMAT: Record<string, string> = {
	day: "%Y-%m-%d",
	month: "%Y-%m",
	year: "%Y",
};

// ── 1. Revenue by product over time ─────────────────────────────────

export const getRevenueByProduct = async ({
	ctx,
	granularity,
}: {
	ctx: AutumnContext;
	granularity: "day" | "month" | "year";
}) => {
	const ch = getClickhouseClient();
	const { org } = ctx;

	const dateFormat = GRANULARITY_FORMAT[granularity];

	// Limit date range based on granularity to keep charts readable
	const dateCutoffMap: Record<string, string> = {
		day: `AND i.created_at >= toInt64(toUnixTimestamp(now() - INTERVAL 30 DAY)) * 1000`,
		month: `AND i.created_at >= toInt64(toUnixTimestamp(now() - INTERVAL 24 MONTH)) * 1000`,
		year: `AND i.created_at >= toInt64(toUnixTimestamp(now() - INTERVAL 10 YEAR)) * 1000`,
	};
	const dateCutoff = dateCutoffMap[granularity] ?? "";

	const query = `
		SELECT
			formatDateTime(
				toDateTime(i.created_at / 1000),
				{date_format:String}
			) AS period_label,
			p.name AS product_name,
			SUM(i.total / length(i.internal_product_ids)) AS volume,
			o.default_currency AS currency
		FROM invoices AS i FINAL
		ARRAY JOIN i.internal_product_ids AS ipid
		INNER JOIN (
			SELECT internal_id, org_id, name
			FROM products FINAL
		) AS p ON p.internal_id = ipid AND p.org_id = {org_id:String}
		INNER JOIN (
			SELECT internal_id, org_id, env
			FROM customers FINAL
		) AS cus ON cus.internal_id = i.internal_customer_id AND cus.org_id = {org_id:String}
		INNER JOIN (
			SELECT id, default_currency
			FROM organizations FINAL
		) AS o ON o.id = {org_id:String}
		WHERE cus.env = 'live'
			AND i.hosted_invoice_url LIKE '%live%'
			AND i.status = 'paid'
			AND i.__action != 'delete'
			${dateCutoff}
		GROUP BY period_label, product_name, currency
		ORDER BY period_label ASC, product_name ASC
	`;

	const result = await ch.query({
		query,
		query_params: {
			org_id: org.id,
			date_format: dateFormat,
		},
		format: "JSON",
	});

	const resultJson = (await result.json()) as ClickHouseResult<{
		period_label: string;
		product_name: string;
		volume: string;
		currency: string;
	}>;

	return resultJson.data.map((row) => ({
		period_label: row.period_label,
		product_name: row.product_name,
		volume: Number(row.volume),
		currency: row.currency,
	})) as RevenueByProductRow[];
};

// ── 2. All-time revenue share per product ───────────────────────────

export const getRevenueProductShare = async ({
	ctx,
}: {
	ctx: AutumnContext;
}) => {
	const ch = getClickhouseClient();
	const { org } = ctx;

	const query = `
		SELECT
			p.name AS product_name,
			SUM(i.total / length(i.internal_product_ids)) AS volume,
			o.default_currency AS currency
		FROM invoices AS i FINAL
		ARRAY JOIN i.internal_product_ids AS ipid
		INNER JOIN (
			SELECT internal_id, org_id, name
			FROM products FINAL
		) AS p ON p.internal_id = ipid AND p.org_id = {org_id:String}
		INNER JOIN (
			SELECT internal_id, org_id, env
			FROM customers FINAL
		) AS cus ON cus.internal_id = i.internal_customer_id AND cus.org_id = {org_id:String}
		INNER JOIN (
			SELECT id, default_currency
			FROM organizations FINAL
		) AS o ON o.id = {org_id:String}
		WHERE cus.env = 'live'
			AND i.hosted_invoice_url LIKE '%live%'
			AND i.status = 'paid'
			AND i.__action != 'delete'
		GROUP BY product_name, currency
		ORDER BY volume DESC
	`;

	const result = await ch.query({
		query,
		query_params: {
			org_id: org.id,
		},
		format: "JSON",
	});

	const resultJson = (await result.json()) as ClickHouseResult<{
		product_name: string;
		volume: string;
		currency: string;
	}>;

	return resultJson.data.map((row) => ({
		product_name: row.product_name,
		volume: Number(row.volume),
		currency: row.currency,
	})) as ProductShareRow[];
};

// ── 3. Average revenue per customer (monthly) ──────────────────────

export const getArpc = async ({ ctx }: { ctx: AutumnContext }) => {
	const ch = getClickhouseClient();
	const { org } = ctx;

	const query = `
		SELECT
			formatDateTime(
				toDateTime(i.created_at / 1000),
				'%Y-%m'
			) AS period_label,
			SUM(i.total) / COUNT(DISTINCT i.internal_customer_id) AS arpc,
			COUNT(DISTINCT i.internal_customer_id) AS customer_count,
			o.default_currency AS currency
		FROM invoices AS i FINAL
		INNER JOIN (
			SELECT internal_id, org_id, env
			FROM customers FINAL
		) AS cus ON cus.internal_id = i.internal_customer_id AND cus.org_id = {org_id:String}
		INNER JOIN (
			SELECT id, default_currency
			FROM organizations FINAL
		) AS o ON o.id = {org_id:String}
		WHERE cus.env = 'live'
			AND i.hosted_invoice_url LIKE '%live%'
			AND i.status = 'paid'
			AND i.__action != 'delete'
		GROUP BY period_label, currency
		ORDER BY period_label ASC
	`;

	const result = await ch.query({
		query,
		query_params: {
			org_id: org.id,
		},
		format: "JSON",
	});

	const resultJson = (await result.json()) as ClickHouseResult<{
		period_label: string;
		arpc: string;
		customer_count: string;
		currency: string;
	}>;

	return resultJson.data.map((row) => ({
		period_label: row.period_label,
		arpc: Number(row.arpc),
		customer_count: Number(row.customer_count),
		currency: row.currency,
	})) as ArpcRow[];
};

// ── 4. Invoice status breakdown ─────────────────────────────────────

export const getInvoiceStatus = async ({ ctx }: { ctx: AutumnContext }) => {
	const ch = getClickhouseClient();
	const { org } = ctx;

	const query = `
		SELECT
			i.status AS status,
			COUNT(*) AS invoice_count,
			SUM(i.total) AS total_volume,
			o.default_currency AS currency
		FROM invoices AS i FINAL
		INNER JOIN (
			SELECT internal_id, org_id, env
			FROM customers FINAL
		) AS cus ON cus.internal_id = i.internal_customer_id AND cus.org_id = {org_id:String}
		INNER JOIN (
			SELECT id, default_currency
			FROM organizations FINAL
		) AS o ON o.id = {org_id:String}
		WHERE cus.env = 'live'
			AND i.hosted_invoice_url LIKE '%live%'
			AND i.__action != 'delete'
		GROUP BY status, currency
		ORDER BY total_volume DESC
	`;

	const result = await ch.query({
		query,
		query_params: {
			org_id: org.id,
		},
		format: "JSON",
	});

	const resultJson = (await result.json()) as ClickHouseResult<{
		status: string;
		invoice_count: string;
		total_volume: string;
		currency: string;
	}>;

	return resultJson.data.map((row) => ({
		status: row.status,
		invoice_count: Number(row.invoice_count),
		total_volume: Number(row.total_volume),
		currency: row.currency,
	})) as InvoiceStatusRow[];
};

// ── 5. Top 10 customers by paid volume ──────────────────────────────

export const getCustomerLeaderboard = async ({
	ctx,
}: {
	ctx: AutumnContext;
}) => {
	const ch = getClickhouseClient();
	const { org } = ctx;

	const query = `
		SELECT
			i.internal_customer_id AS internal_customer_id,
			any(cus.name) AS customer_name,
			any(cus.id) AS customer_id,
			any(cus.email) AS customer_email,
			SUM(i.total) AS total_volume,
			COUNT(*) AS invoice_count,
			o.default_currency AS currency
		FROM invoices AS i FINAL
		INNER JOIN (
			SELECT internal_id, org_id, env, id, name, email
			FROM customers FINAL
		) AS cus ON cus.internal_id = i.internal_customer_id AND cus.org_id = {org_id:String}
		INNER JOIN (
			SELECT id, default_currency
			FROM organizations FINAL
		) AS o ON o.id = {org_id:String}
		WHERE cus.env = 'live'
			AND i.hosted_invoice_url LIKE '%live%'
			AND i.status = 'paid'
			AND i.__action != 'delete'
		GROUP BY internal_customer_id, currency
		ORDER BY total_volume DESC
		LIMIT 10
	`;

	const result = await ch.query({
		query,
		query_params: {
			org_id: org.id,
		},
		format: "JSON",
	});

	const resultJson = (await result.json()) as ClickHouseResult<{
		internal_customer_id: string;
		customer_name: string | null;
		customer_id: string | null;
		customer_email: string | null;
		total_volume: string;
		invoice_count: string;
		currency: string;
	}>;

	return resultJson.data.map((row) => ({
		internal_customer_id: row.internal_customer_id,
		customer_name: row.customer_name,
		customer_id: row.customer_id,
		customer_email: row.customer_email,
		total_volume: Number(row.total_volume),
		invoice_count: Number(row.invoice_count),
		currency: row.currency,
	})) as CustomerLeaderboardRow[];
};

// ── 6. Estimated MRR (current snapshot) ─────────────────────────────

export type EstimatedMrrResult = {
	estimated_mrr: number;
	active_subscriptions: number;
	currency: string;
};

export const getEstimatedMrr = async ({
	ctx,
}: {
	ctx: AutumnContext;
}): Promise<EstimatedMrrResult> => {
	const ch = getClickhouseClient();
	const { org } = ctx;

	const query = `
		SELECT
			SUM(
				CASE JSONExtractString(pr.config, 'interval')
					WHEN 'month' THEN JSONExtractFloat(pr.config, 'amount') * cp.quantity
					WHEN 'quarter' THEN JSONExtractFloat(pr.config, 'amount') * cp.quantity / 3
					WHEN 'semi_annual' THEN JSONExtractFloat(pr.config, 'amount') * cp.quantity / 6
					WHEN 'year' THEN JSONExtractFloat(pr.config, 'amount') * cp.quantity / 12
					WHEN 'week' THEN JSONExtractFloat(pr.config, 'amount') * cp.quantity * 4.33
					ELSE 0
				END
			) AS estimated_mrr,
			COUNT(DISTINCT cp.internal_customer_id) AS active_subscriptions,
			o.default_currency AS currency
		FROM (
			SELECT
				internal_customer_id,
				argMax(id, created_at) AS id,
				argMax(internal_product_id, created_at) AS internal_product_id,
				argMax(quantity, created_at) AS quantity
			FROM customer_products FINAL
			WHERE __action != 'delete'
				AND canceled = 0
				AND status = 'active'
				AND (ended_at IS NULL OR ended_at = 0)
			GROUP BY internal_customer_id
		) AS cp
		INNER JOIN (
			SELECT
				internal_product_id,
				argMin(config, created_at) AS config
			FROM prices FINAL
			WHERE __action != 'delete'
				AND org_id = {org_id:String}
				AND (entitlement_id IS NULL OR entitlement_id = '')
			GROUP BY internal_product_id
		) AS pr ON pr.internal_product_id = cp.internal_product_id
		INNER JOIN (
			SELECT internal_id, org_id, env
			FROM customers FINAL
			WHERE __action != 'delete'
		) AS cus ON cus.internal_id = cp.internal_customer_id
			AND cus.org_id = {org_id:String}
		INNER JOIN (
			SELECT id, default_currency
			FROM organizations FINAL
		) AS o ON o.id = {org_id:String}
		WHERE cus.env = 'live'
			AND JSONExtractString(pr.config, 'interval') != 'one_off'
		GROUP BY currency
	`;

	const result = await ch.query({
		query,
		query_params: { org_id: org.id },
		format: "JSON",
	});

	const resultJson = (await result.json()) as ClickHouseResult<{
		estimated_mrr: string;
		active_subscriptions: string;
		currency: string;
	}>;

	if (!resultJson.data.length) {
		return {
			estimated_mrr: 0,
			active_subscriptions: 0,
			currency: org.default_currency || "usd",
		};
	}

	const row = resultJson.data[0];
	return {
		estimated_mrr: Number(row.estimated_mrr),
		active_subscriptions: Number(row.active_subscriptions),
		currency: row.currency,
	};
};
