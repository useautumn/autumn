import {
	type DbCustomerLicense,
	isFixedPrice,
	isOneOffPrice,
	type LicenseBillingPriceRow,
	type Price,
} from "@autumn/shared";
import { type SQL, sql } from "drizzle-orm";
import type { DrizzleCli } from "@/db/initDrizzle.js";

/** SQL predicate: the aliased customer_products row is a live seat. */
const liveSeatSql = (alias: string) =>
	sql.raw(
		`${alias}.customer_license_link_id IS NOT NULL AND ${alias}.internal_entity_id IS NOT NULL AND ${alias}.status IN ('active', 'past_due')`,
	);

type AssignmentPriceCount = {
	customer_license_link_id: string;
	price: Price;
	count: number;
};

/** The earliest `includedSeatCount` seats per pool link ride free —
 * a tiny per-link top-N via the (customer_license_link_id, created_at, id)
 * index, excluded from billing below. */
const freeSeatExclusionSql = (
	withFreeSeats: { linkId: string; includedSeatCount: number }[],
): SQL => {
	if (withFreeSeats.length === 0) return sql``;
	return sql`AND s.id NOT IN (
		SELECT free_seat.id
		FROM (VALUES ${sql.join(
			withFreeSeats.map(
				({ linkId, includedSeatCount }) =>
					sql`(${linkId}, ${includedSeatCount}::int)`,
			),
			sql`, `,
		)}) AS l(link_id, included)
		JOIN LATERAL (
			SELECT s.id
			FROM customer_products s
			WHERE s.customer_license_link_id = l.link_id
				AND ${liveSeatSql("s")}
			ORDER BY s.created_at, s.id
			LIMIT l.included
		) free_seat ON true
	)`;
};

/**
 * Billing rows for assigned seats: each live seat bills at its own
 * customer_prices snapshot (grandfathered / customized rows flow through
 * untouched), grouped by price in one hash-agg pass — never enumerates
 * seats. The unassigned buffer is priced in-memory from the hydrated
 * customer license; it has no rows here by design.
 */
export const listBillingPriceRows = async ({
	db,
	customerLicenses,
}: {
	db: DrizzleCli;
	customerLicenses: Pick<
		DbCustomerLicense,
		| "id"
		| "link_id"
		| "parent_customer_product_id"
		| "granted"
		| "paid_quantity"
	>[];
}): Promise<LicenseBillingPriceRow[]> => {
	if (customerLicenses.length === 0) return [];

	const customerLicenseByLinkId = new Map(
		customerLicenses.map((customerLicense) => [
			customerLicense.link_id,
			customerLicense,
		]),
	);

	// included = granted − paid; those earliest seats ride free.
	const includedSeatCounts = customerLicenses.map((customerLicense) => ({
		linkId: customerLicense.link_id,
		includedSeatCount: Math.max(
			0,
			customerLicense.granted - customerLicense.paid_quantity,
		),
	}));

	const rows = (await db.execute(sql`
		SELECT
			s.customer_license_link_id,
			to_jsonb(p.*) AS price,
			count(*)::int AS count
		FROM customer_products s
		JOIN customer_prices cp ON cp.customer_product_id = s.id
		JOIN prices p ON p.id = cp.price_id
		WHERE s.customer_license_link_id IN (${sql.join(
			customerLicenses.map(
				(customerLicense) => sql`${customerLicense.link_id}`,
			),
			sql`, `,
		)})
			AND ${liveSeatSql("s")}
			${freeSeatExclusionSql(
				includedSeatCounts.filter(
					({ includedSeatCount }) => includedSeatCount > 0,
				),
			)}
		GROUP BY s.customer_license_link_id, to_jsonb(p.*)
	`)) as unknown as AssignmentPriceCount[];

	return rows
		.filter(({ price }) => isFixedPrice(price) && !isOneOffPrice(price))
		.flatMap((row) => {
			const customerLicense = customerLicenseByLinkId.get(
				row.customer_license_link_id,
			);
			if (!customerLicense) return [];
			return [
				{
					customerProductId: customerLicense.parent_customer_product_id,
					price: row.price,
					quantity: row.count,
					source: {
						type: "customer_license_seat" as const,
						customerLicenseId: customerLicense.id,
					},
				},
			];
		});
};
