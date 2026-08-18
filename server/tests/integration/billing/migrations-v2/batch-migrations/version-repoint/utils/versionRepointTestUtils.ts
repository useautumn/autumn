import { expect } from "bun:test";
import {
	CusProductStatus,
	customerProducts,
	customers,
	products,
} from "@autumn/shared";
import type { MigrationFilter } from "@autumn/shared/api/migrations/filters/migrationFilter.js";
import type { Operations } from "@autumn/shared/api/migrations/operations/operations.js";
import { and, asc, eq, inArray } from "drizzle-orm";
import type { AutumnContext } from "@/honoUtils/HonoEnv.js";
import { runChunkedMigration } from "../../../utils/runChunkedMigration.js";

type MigrationClient = Parameters<
	typeof runChunkedMigration
>[0]["migrationClient"];

export const REPOINTABLE_STATUSES = [
	CusProductStatus.Active,
	CusProductStatus.PastDue,
	CusProductStatus.Paused,
	CusProductStatus.Scheduled,
] as const;

const selectCustomerPlanRows = async ({
	ctx,
	customerId,
	planId,
	statuses,
}: {
	ctx: AutumnContext;
	customerId: string;
	planId: string;
	statuses?: CusProductStatus[];
}) =>
	ctx.db
		.select({
			id: customerProducts.id,
			internalProductId: customerProducts.internal_product_id,
			version: products.version,
			status: customerProducts.status,
			isCustom: customerProducts.is_custom,
			startsAt: customerProducts.starts_at,
			canceledAt: customerProducts.canceled_at,
			endedAt: customerProducts.ended_at,
			trialEndsAt: customerProducts.trial_ends_at,
			billingCycleAnchor: customerProducts.billing_cycle_anchor,
			subscriptionIds: customerProducts.subscription_ids,
			scheduledIds: customerProducts.scheduled_ids,
			options: customerProducts.options,
			internalEntityId: customerProducts.internal_entity_id,
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
				eq(customerProducts.product_id, planId),
				statuses ? inArray(customerProducts.status, statuses) : undefined,
			),
		)
		.orderBy(asc(customerProducts.created_at), asc(customerProducts.id));

export type CustomerPlanRow = Awaited<
	ReturnType<typeof selectCustomerPlanRows>
>[number];

export const readCustomerPlanRows = ({
	ctx,
	customerId,
	planId,
}: {
	ctx: AutumnContext;
	customerId: string;
	planId: string;
}) => selectCustomerPlanRows({ ctx, customerId, planId });

export const readRepointableCustomerPlanRow = async ({
	ctx,
	customerId,
	planId,
}: {
	ctx: AutumnContext;
	customerId: string;
	planId: string;
}) => {
	const rows = await selectCustomerPlanRows({
		ctx,
		customerId,
		planId,
		statuses: [...REPOINTABLE_STATUSES],
	});

	expect(
		rows,
		`Expected one repointable ${planId} row for ${customerId}`,
	).toHaveLength(1);
	return rows[0];
};

export const expectCustomerPlanRepointedInPlace = ({
	before,
	after,
	targetVersion,
}: {
	before: CustomerPlanRow;
	after: CustomerPlanRow;
	targetVersion: number;
}) => {
	expect(after.id).toBe(before.id);
	expect(after.internalProductId).not.toBe(before.internalProductId);
	expect(after.version).toBe(targetVersion);
	expect({
		status: after.status,
		isCustom: after.isCustom,
		startsAt: after.startsAt,
		canceledAt: after.canceledAt,
		endedAt: after.endedAt,
		trialEndsAt: after.trialEndsAt,
		billingCycleAnchor: after.billingCycleAnchor,
		subscriptionIds: after.subscriptionIds,
		scheduledIds: after.scheduledIds,
		options: after.options,
		internalEntityId: after.internalEntityId,
	}).toEqual({
		status: before.status,
		isCustom: before.isCustom,
		startsAt: before.startsAt,
		canceledAt: before.canceledAt,
		endedAt: before.endedAt,
		trialEndsAt: before.trialEndsAt,
		billingCycleAnchor: before.billingCycleAnchor,
		subscriptionIds: before.subscriptionIds,
		scheduledIds: before.scheduledIds,
		options: before.options,
		internalEntityId: before.internalEntityId,
	});
};

export const runVersionRepointMigration = ({
	ctx,
	migrationClient,
	migrationId,
	filter,
	operations,
}: {
	ctx: AutumnContext;
	migrationClient: MigrationClient;
	migrationId: string;
	filter: MigrationFilter;
	operations: Operations;
}) =>
	runChunkedMigration({
		ctx,
		migrationClient,
		migrationId,
		filter,
		operations,
		noBillingChanges: true,
	});

export const expectBatchLane = ({
	result,
}: {
	result: Awaited<ReturnType<typeof runChunkedMigration>>["result"];
}) => {
	expect({
		lane: result?.lane,
		rejections: result?.rejections ?? [],
	}).toEqual({ lane: "batch", rejections: [] });
};

export const expectPerCustomerLaneWithRejections = ({
	result,
	codes,
}: {
	result: Awaited<ReturnType<typeof runChunkedMigration>>["result"];
	codes: string[];
}) => {
	expect(result?.lane).toBe("per_customer");
	expect(result?.rejections?.map(({ code }) => code)).toEqual(
		expect.arrayContaining(codes),
	);
};
