import {
	ACTIVE_STATUSES,
	type FullCustomerPrice,
	RELEVANT_STATUSES,
} from "@autumn/shared";
import { sql } from "drizzle-orm";
import { planetScaleTag } from "@/db/dbUtils.js";
import type { DrizzleCli } from "@/db/initDrizzle.js";

export type DashboardCustomerListProduct = {
	id: string;
	internal_product_id: string;
	product_id: string;
	canceled_at: number | null;
	status: string;
	trial_ends_at: number | null;
	created_at: number;
	quantity: number;
	product: {
		internal_id: string;
		id: string;
		name: string | null;
		version: number;
		is_add_on: boolean | null;
	};
	customer_prices?: FullCustomerPrice[];
};

export type DashboardCustomerListCustomer = {
	internal_id: string;
	id: string | null;
	name: string | null;
	email: string | null;
	created_at: number;
	currency: string | null;
	customer_products: DashboardCustomerListProduct[];
	products_total_count: number;
};

type DashboardCustomerListRow = {
	ordinality: number | string;
	internal_id: string;
	id: string | null;
	name: string | null;
	email: string | null;
	customer_created_at: number | string;
	currency: string | null;
	products_total_count: number | string;
	customer_product_id: string | null;
	internal_product_id: string | null;
	product_id: string | null;
	canceled_at: number | string | null;
	status: string | null;
	trial_ends_at: number | string | null;
	customer_product_created_at: number | string | null;
	quantity: number | string | null;
	product_internal_id: string | null;
	product_catalog_id: string | null;
	product_name: string | null;
	product_version: number | string | null;
	product_is_add_on: boolean | null;
};

type CustomerPriceRow = {
	customer_product_id: string;
	customer_price: FullCustomerPrice;
};

const toNumber = (value: number | string | null): number | null => {
	if (value === null) return null;
	return typeof value === "number" ? value : Number(value);
};

export const assembleDashboardCustomerList = ({
	rows,
	pricesByCustomerProductId,
}: {
	rows: DashboardCustomerListRow[];
	pricesByCustomerProductId?: Map<string, FullCustomerPrice[]>;
}): DashboardCustomerListCustomer[] => {
	const customers = new Map<string, DashboardCustomerListCustomer>();

	for (const row of rows) {
		let customer = customers.get(row.internal_id);
		if (!customer) {
			customer = {
				internal_id: row.internal_id,
				id: row.id,
				name: row.name,
				email: row.email,
				created_at: Number(row.customer_created_at),
				currency: row.currency,
				customer_products: [],
				products_total_count: Number(row.products_total_count),
			};
			customers.set(row.internal_id, customer);
		}

		if (
			!row.customer_product_id ||
			!row.internal_product_id ||
			!row.product_id ||
			!row.status ||
			!row.product_internal_id ||
			!row.product_catalog_id ||
			row.product_version === null
		) {
			continue;
		}

		customer.customer_products.push({
			id: row.customer_product_id,
			internal_product_id: row.internal_product_id,
			product_id: row.product_id,
			canceled_at: toNumber(row.canceled_at),
			status: row.status,
			trial_ends_at: toNumber(row.trial_ends_at),
			created_at: Number(row.customer_product_created_at),
			quantity: toNumber(row.quantity) ?? 1,
			product: {
				internal_id: row.product_internal_id,
				id: row.product_catalog_id,
				name: row.product_name,
				version: Number(row.product_version),
				is_add_on: row.product_is_add_on,
			},
			customer_prices: pricesByCustomerProductId?.get(row.customer_product_id),
		});
	}

	return Array.from(customers.values());
};

export const getDashboardCustomerListRows = async ({
	db,
	internalCustomerIds,
	productLimit,
}: {
	db: DrizzleCli;
	internalCustomerIds: string[];
	productLimit: number;
}): Promise<DashboardCustomerListRow[]> => {
	if (internalCustomerIds.length === 0) return [];

	return (await db.execute(sql`
		WITH requested AS MATERIALIZED (
			SELECT internal_id, ordinality
			FROM unnest(${sql.param(internalCustomerIds)}::text[])
				WITH ORDINALITY AS requested(internal_id, ordinality)
		), ranked AS MATERIALIZED (
			SELECT
				requested.ordinality,
				c.internal_id,
				c.id,
				c.name,
				c.email,
				c.created_at AS customer_created_at,
				c.currency,
				COUNT(cp.id) FILTER (
					WHERE cp.status = ANY(${sql.param(ACTIVE_STATUSES)}::text[])
				) OVER (PARTITION BY c.internal_id)::int AS products_total_count,
				cp.id AS customer_product_id,
				cp.internal_product_id,
				cp.product_id,
				cp.canceled_at,
				cp.status,
				cp.trial_ends_at,
				cp.created_at AS customer_product_created_at,
				cp.quantity,
				p.internal_id AS product_internal_id,
				p.id AS product_catalog_id,
				p.name AS product_name,
				p.version AS product_version,
				p.is_add_on AS product_is_add_on,
				ROW_NUMBER() OVER (
					PARTITION BY c.internal_id
					ORDER BY p.is_add_on ASC NULLS LAST, cp.created_at DESC, cp.id ASC
				) AS product_rank
			FROM requested
			JOIN customers c
				ON c.internal_id COLLATE "C" = requested.internal_id COLLATE "C"
			LEFT JOIN customer_products cp
				ON cp.internal_customer_id = c.internal_id
				AND cp.customer_license_link_id IS NULL
				AND cp.status = ANY(${sql.param(RELEVANT_STATUSES)}::text[])
			LEFT JOIN products p ON p.internal_id = cp.internal_product_id
		)
		SELECT *
		FROM ranked
		WHERE product_rank <= ${productLimit}
		ORDER BY ordinality ASC, product_rank ASC
		${planetScaleTag({ query: "getDashboardCustomerListRows" })}
	`)) as unknown as DashboardCustomerListRow[];
};

export const getCustomerPricesByCustomerProductIds = async ({
	db,
	customerProductIds,
}: {
	db: DrizzleCli;
	customerProductIds: string[];
}): Promise<Map<string, FullCustomerPrice[]>> => {
	if (customerProductIds.length === 0) return new Map();

	const rows = (await db.execute(sql`
		SELECT
			cpr.customer_product_id,
			(
				row_to_json(cpr)::jsonb
				|| jsonb_build_object('price', row_to_json(p))
			)::json AS customer_price
		FROM customer_prices cpr
		JOIN prices p ON p.id = cpr.price_id
		WHERE cpr.customer_product_id COLLATE "C"
			= ANY(${sql.param(customerProductIds)}::text[])
		ORDER BY cpr.customer_product_id, cpr.created_at, cpr.id
		${planetScaleTag({ query: "getCustomerPricesByCustomerProductIds" })}
	`)) as unknown as CustomerPriceRow[];

	const pricesByCustomerProductId = new Map<string, FullCustomerPrice[]>();
	for (const row of rows) {
		const prices = pricesByCustomerProductId.get(row.customer_product_id);
		if (prices) prices.push(row.customer_price);
		else
			pricesByCustomerProductId.set(row.customer_product_id, [
				row.customer_price,
			]);
	}

	return pricesByCustomerProductId;
};
