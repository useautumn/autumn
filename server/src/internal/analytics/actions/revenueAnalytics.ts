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
			SUM(i.total) AS volume,
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
			SUM(i.total) AS volume,
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
