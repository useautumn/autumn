import { expect } from "bun:test";
import {
	customerEntitlements,
	customerProducts,
	customers,
	entitlements,
} from "@autumn/shared";
import { and, asc, eq } from "drizzle-orm";
import type { AutumnContext } from "@/honoUtils/HonoEnv.js";
import {
	expectBatchLane,
	expectCustomerPlanRepointedInPlace,
	readCustomerPlanRows,
	readRepointableCustomerPlanRow,
} from "./versionRepointTestUtils.js";

/** cusEnt rows for one feature joined with the definition each row claims —
 * the shape same-feature pairing assertions (interval, carry, allowance) need. */
export const readFeatureRowsWithDefinition = async ({
	ctx,
	customerId,
	featureId,
}: {
	ctx: AutumnContext;
	customerId: string;
	featureId: string;
}) =>
	ctx.db
		.select({
			id: customerEntitlements.id,
			entitlementId: customerEntitlements.entitlement_id,
			balance: customerEntitlements.balance,
			unlimited: customerEntitlements.unlimited,
			nextResetAt: customerEntitlements.next_reset_at,
			resetCycleAnchor: customerEntitlements.reset_cycle_anchor,
			interval: entitlements.interval,
			intervalCount: entitlements.interval_count,
			allowance: entitlements.allowance,
			carryFromPrevious: entitlements.carry_from_previous,
		})
		.from(customerEntitlements)
		.innerJoin(
			entitlements,
			eq(entitlements.id, customerEntitlements.entitlement_id),
		)
		.innerJoin(
			customerProducts,
			eq(customerProducts.id, customerEntitlements.customer_product_id),
		)
		.innerJoin(
			customers,
			eq(customers.internal_id, customerProducts.internal_customer_id),
		)
		.where(
			and(
				eq(customers.org_id, ctx.org.id),
				eq(customers.env, ctx.env),
				eq(customers.id, customerId),
				eq(customerEntitlements.feature_id, featureId),
			),
		)
		.orderBy(
			asc(customerEntitlements.created_at),
			asc(customerEntitlements.id),
		);

export type FeatureRowWithDefinition = Awaited<
	ReturnType<typeof readFeatureRowsWithDefinition>
>[number];

export const expectVersionRepointedOnce = async ({
	ctx,
	customerId,
	planId,
	before,
	targetVersion,
	result,
}: {
	ctx: AutumnContext;
	customerId: string;
	planId: string;
	before: Awaited<ReturnType<typeof readRepointableCustomerPlanRow>>;
	targetVersion: number;
	result: Parameters<typeof expectBatchLane>[0]["result"];
}) => {
	expectBatchLane({ result });
	const after = await readRepointableCustomerPlanRow({
		ctx,
		customerId,
		planId,
	});
	expectCustomerPlanRepointedInPlace({ before, after, targetVersion });
	expect(await readCustomerPlanRows({ ctx, customerId, planId })).toHaveLength(
		1,
	);
};

/** Mints the next plan version via the RPC route (v2 item shapes only —
 * internal ProductItem fixtures get stripped by the params schema). */
export const mintPlanVersion = async ({
	client,
	planId,
	items,
}: {
	client: {
		post: (path: string, body: Record<string, unknown>) => Promise<unknown>;
	};
	planId: string;
	items: Record<string, unknown>[];
}) => {
	await client.post("/plans.update", {
		plan_id: planId,
		force_version: true,
		items,
	});
};
