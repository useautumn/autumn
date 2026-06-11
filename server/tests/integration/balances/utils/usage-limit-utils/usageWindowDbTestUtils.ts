import type { TestContext } from "@tests/utils/testInitUtils/createTestContext.js";
import { sql } from "drizzle-orm";

// biome-ignore lint/suspicious/noExplicitAny: raw SQL rows are untyped
export const queryRows = (result: unknown): any[] =>
	// biome-ignore lint/suspicious/noExplicitAny: raw SQL rows are untyped
	Array.isArray(result) ? result : ((result as { rows?: any[] })?.rows ?? []);

/** The feature's cusEnt on the customer's ACTIVE plan (excludes loose grants). */
export const fetchActivePlanCusEnt = async ({
	ctx,
	customerId,
	featureId,
}: {
	ctx: TestContext;
	customerId: string;
	featureId: string;
}) => {
	const rows = queryRows(
		await ctx.db.execute(sql`
			SELECT ce.id, ce.internal_feature_id, ce.next_reset_at
			FROM customer_entitlements ce
			JOIN customer_products cp ON cp.id = ce.customer_product_id
			WHERE ce.internal_customer_id = (
					SELECT internal_id FROM customers
					WHERE id = ${customerId} AND org_id = ${ctx.org.id} AND env = ${ctx.env}
					LIMIT 1
				)
				AND ce.feature_id = ${featureId}
				AND cp.status = 'active'
			LIMIT 1
		`),
	);
	return rows[0];
};

/** The feature's loose (product-less) cusEnt, e.g. a top-up grant. */
export const fetchLooseCusEnt = async ({
	ctx,
	customerId,
	featureId,
}: {
	ctx: TestContext;
	customerId: string;
	featureId: string;
}) => {
	const rows = queryRows(
		await ctx.db.execute(sql`
			SELECT id, internal_feature_id, next_reset_at
			FROM customer_entitlements
			WHERE internal_customer_id = (
					SELECT internal_id FROM customers
					WHERE id = ${customerId} AND org_id = ${ctx.org.id} AND env = ${ctx.env}
					LIMIT 1
				)
				AND feature_id = ${featureId}
				AND customer_product_id IS NULL
			ORDER BY created_at ASC
			LIMIT 1
		`),
	);
	return rows[0];
};

/** All usage-window counter rows for a (customer, feature). */
export const fetchUsageWindowRows = async ({
	ctx,
	customerId,
	featureId,
}: {
	ctx: TestContext;
	customerId: string;
	featureId: string;
}) =>
	queryRows(
		await ctx.db.execute(sql`
			SELECT id, anchor_customer_entitlement_id, internal_entity_id,
				window_start_at, window_end_at, usage
			FROM usage_windows
			WHERE feature_id = ${featureId}
				AND internal_customer_id = (
					SELECT internal_id FROM customers
					WHERE id = ${customerId} AND org_id = ${ctx.org.id} AND env = ${ctx.env}
					LIMIT 1
				)
			ORDER BY window_start_at ASC
		`),
	);
