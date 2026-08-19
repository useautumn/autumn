import {
	customerEntitlements,
	customerLicenses,
	customerProducts,
	customers,
	entitlements,
	prices,
	products,
	rollovers,
} from "@autumn/shared";
import { and, asc, eq, inArray } from "drizzle-orm";
import type { AutumnContext } from "@/honoUtils/HonoEnv.js";
import type { SeededCast } from "./seedMigrationCast";

const readPlanRows = ({
	ctx,
	customerId,
}: {
	ctx: AutumnContext;
	customerId: string;
}) =>
	ctx.db
		.select({
			customerProductId: customerProducts.id,
			planId: customerProducts.product_id,
			version: products.version,
			status: customerProducts.status,
			isCustom: customerProducts.is_custom,
			internalEntityId: customerProducts.internal_entity_id,
			licenseLinkId: customerProducts.customer_license_link_id,
		})
		.from(customerProducts)
		.innerJoin(
			customers,
			eq(customerProducts.internal_customer_id, customers.internal_id),
		)
		.innerJoin(
			products,
			eq(customerProducts.internal_product_id, products.internal_id),
		)
		.where(
			and(
				eq(customers.org_id, ctx.org.id),
				eq(customers.env, ctx.env),
				eq(customers.id, customerId),
			),
		)
		.orderBy(asc(customerProducts.created_at), asc(customerProducts.id));

const readFeatureRows = ({
	ctx,
	customerId,
}: {
	ctx: AutumnContext;
	customerId: string;
}) =>
	ctx.db
		.select({
			id: customerEntitlements.id,
			planId: customerProducts.product_id,
			isAssignment: customerProducts.customer_license_link_id,
			featureId: customerEntitlements.feature_id,
			balance: customerEntitlements.balance,
			unlimited: customerEntitlements.unlimited,
			nextResetAt: customerEntitlements.next_reset_at,
			entitlementId: customerEntitlements.entitlement_id,
			allowance: entitlements.allowance,
			interval: entitlements.interval,
			intervalCount: entitlements.interval_count,
			isCustomDefinition: entitlements.is_custom,
			entityFeatureId: entitlements.entity_feature_id,
			pooled: entitlements.pooled,
			priceId: prices.id,
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
		.innerJoin(
			entitlements,
			eq(entitlements.id, customerEntitlements.entitlement_id),
		)
		.leftJoin(
			prices,
			eq(prices.entitlement_id, customerEntitlements.entitlement_id),
		)
		.where(
			and(
				eq(customers.org_id, ctx.org.id),
				eq(customers.env, ctx.env),
				eq(customers.id, customerId),
			),
		)
		.orderBy(
			asc(customerProducts.created_at),
			asc(customerEntitlements.feature_id),
			asc(customerEntitlements.id),
		);

const readPools = ({
	ctx,
	customerId,
}: {
	ctx: AutumnContext;
	customerId: string;
}) =>
	ctx.db
		.select({
			id: customerLicenses.id,
			linkId: customerLicenses.link_id,
			planLicenseId: customerLicenses.plan_license_id,
			licenseInternalProductId: customerLicenses.license_internal_product_id,
			granted: customerLicenses.granted,
			remaining: customerLicenses.remaining,
			paidQuantity: customerLicenses.paid_quantity,
		})
		.from(customerLicenses)
		.innerJoin(
			customers,
			eq(customerLicenses.internal_customer_id, customers.internal_id),
		)
		.where(
			and(
				eq(customers.org_id, ctx.org.id),
				eq(customers.env, ctx.env),
				eq(customers.id, customerId),
			),
		)
		.orderBy(asc(customerLicenses.created_at));

const readRolloverBalances = async ({
	ctx,
	customerEntitlementIds,
}: {
	ctx: AutumnContext;
	customerEntitlementIds: string[];
}) => {
	if (customerEntitlementIds.length === 0) return new Map<string, number>();
	const rows = await ctx.db
		.select({
			cusEntId: rollovers.cus_ent_id,
			balance: rollovers.balance,
		})
		.from(rollovers)
		.where(inArray(rollovers.cus_ent_id, customerEntitlementIds));

	return rows.reduce((totals, { cusEntId, balance }) => {
		totals.set(cusEntId, (totals.get(cusEntId) ?? 0) + balance);
		return totals;
	}, new Map<string, number>());
};

/** Everything a migration can touch for one customer, in one object. */
export const snapshotCustomerState = async ({
	ctx,
	customerId,
}: {
	ctx: AutumnContext;
	customerId: string;
}) => {
	const [planRows, featureRows, pools] = await Promise.all([
		readPlanRows({ ctx, customerId }),
		readFeatureRows({ ctx, customerId }),
		readPools({ ctx, customerId }),
	]);
	const rolloverByRow = await readRolloverBalances({
		ctx,
		customerEntitlementIds: featureRows.map(({ id }) => id),
	});

	return {
		customerId,
		planRows,
		pools,
		featureRows: featureRows.map((row) => ({
			...row,
			isAssignment: row.isAssignment !== null,
			priced: row.priceId !== null,
			rolloverBalance: rolloverByRow.get(row.id) ?? 0,
		})),
	};
};

export type CustomerStateSnapshot = Awaited<
	ReturnType<typeof snapshotCustomerState>
>;

export const snapshotCast = async ({ cast }: { cast: SeededCast }) =>
	Promise.all(
		cast.members.map(({ customerId }) =>
			snapshotCustomerState({ ctx: cast.ctx, customerId }),
		),
	);
