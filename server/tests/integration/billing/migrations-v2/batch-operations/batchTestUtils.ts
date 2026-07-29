import { expect } from "bun:test";
import {
	customerEntitlements,
	customerProducts,
	customers,
	type MigrationItemRunStatus,
} from "@autumn/shared";
import type { initScenario } from "@tests/utils/testInitUtils/initScenario";
import { and, eq } from "drizzle-orm";
import { CusService } from "@/internal/customers/CusService.js";
import { migrationItemRunRepo } from "@/internal/migrations/v2/repos/index.js";

export type ScenarioCtx = Awaited<ReturnType<typeof initScenario>>["ctx"];

export const getInternalCustomerId = async ({
	ctx,
	customerId,
}: {
	ctx: ScenarioCtx;
	customerId: string;
}) => {
	const customer = await CusService.get({
		db: ctx.db,
		idOrInternalId: customerId,
		orgId: ctx.org.id,
		env: ctx.env,
	});
	if (!customer) throw new Error(`Expected customer ${customerId}`);
	return customer.internal_id;
};

export const expectMigrationItemRunStatus = async ({
	ctx,
	migrationInternalId,
	migrationRunId,
	customerId,
	status,
}: {
	ctx: ScenarioCtx;
	migrationInternalId: string;
	migrationRunId: string;
	customerId: string;
	status: MigrationItemRunStatus;
}) => {
	const internalCustomerId = await getInternalCustomerId({ ctx, customerId });
	const itemRun = await migrationItemRunRepo.getCustomer({
		ctx,
		migrationInternalId,
		internalCustomerId,
		dryRun: false,
		migrationRunId,
	});
	expect(itemRun).toMatchObject({ status });
};

/** The new cusEnt's cycle fields plus its cusProduct's anchor sources — the
 * raw rows the anchor-ladder assertions run against. */
export const getCustomerEntitlementCycle = async ({
	ctx,
	customerId,
	featureId,
}: {
	ctx: ScenarioCtx;
	customerId: string;
	featureId: string;
}) => {
	const [row] = await ctx.db
		.select({
			resetCycleAnchor: customerEntitlements.reset_cycle_anchor,
			nextResetAt: customerEntitlements.next_reset_at,
			balance: customerEntitlements.balance,
			cpBillingCycleAnchor: customerProducts.billing_cycle_anchor,
			cpStartsAt: customerProducts.starts_at,
		})
		.from(customerEntitlements)
		.innerJoin(
			customerProducts,
			eq(customerEntitlements.customer_product_id, customerProducts.id),
		)
		.innerJoin(
			customers,
			eq(customerProducts.internal_customer_id, customers.internal_id),
		)
		.where(
			and(
				eq(customers.org_id, ctx.org.id),
				eq(customers.env, ctx.env),
				eq(customers.id, customerId),
				eq(customerEntitlements.feature_id, featureId),
			),
		);
	if (!row)
		throw new Error(
			`Expected customer_entitlement for ${customerId}/${featureId}`,
		);
	return row;
};
