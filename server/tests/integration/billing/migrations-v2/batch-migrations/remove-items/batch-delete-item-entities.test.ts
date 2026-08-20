/**
 * Entity-level copies of a plan are independent customer products, and a
 * matching delete must reach every copy without removing sibling items.
 */
import { expect, test } from "bun:test";
import {
	customerEntitlements,
	customerProducts,
	customers,
} from "@autumn/shared";
import { runChunkedMigration } from "@tests/integration/billing/migrations-v2/utils/runChunkedMigration";
import { TestFeature } from "@tests/setup/v2Features";
import { items } from "@tests/utils/fixtures/items";
import { products } from "@tests/utils/fixtures/products";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario";
import chalk from "chalk";
import { and, eq } from "drizzle-orm";
import type { ScenarioCtx } from "../batchTestUtils";

const MESSAGES_INCLUDED = 100;
const ENTITY_COUNT = 2;

const readEntityRows = async ({
	ctx,
	customerId,
	planId,
	featureId,
}: {
	ctx: ScenarioCtx;
	customerId: string;
	planId: string;
	featureId: string;
}) =>
	ctx.db
		.select({
			customerProductId: customerProducts.id,
			internalEntityId: customerProducts.internal_entity_id,
			entitlementId: customerEntitlements.entitlement_id,
		})
		.from(customerEntitlements)
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
				eq(customerProducts.product_id, planId),
				eq(customerEntitlements.feature_id, featureId),
			),
		);

test(`${chalk.yellowBright("batch migration: deleting an item reaches every entity-level plan copy")}`, async () => {
	const customerId = "batch-delete-entity-copies";
	const plan = products.base({
		id: "batch-delete-entity-copies-plan",
		items: [
			items.dashboard(),
			items.monthlyMessages({ includedUsage: MESSAGES_INCLUDED }),
		],
	});

	const { ctx, autumnV2_2 } = await initScenario({
		customerId,
		setup: [
			s.customer({ testClock: false }),
			s.entities({ count: ENTITY_COUNT, featureId: TestFeature.Users }),
			s.products({ list: [plan] }),
		],
		actions: [
			s.parallel(
				s.attach({ productId: plan.id, entityIndex: 0 }),
				s.attach({ productId: plan.id, entityIndex: 1 }),
			),
		],
	});

	const messageRowsBefore = await readEntityRows({
		ctx,
		customerId,
		planId: plan.id,
		featureId: TestFeature.Messages,
	});
	expect(messageRowsBefore).toHaveLength(ENTITY_COUNT);
	expect(
		new Set(messageRowsBefore.map((row) => row.internalEntityId)).size,
	).toBe(ENTITY_COUNT);

	const { result } = await runChunkedMigration({
		ctx,
		migrationClient: autumnV2_2,
		migrationId: "batch-delete-entity-copies-migration",
		filter: { customer: { plan: { plan_id: plan.id, custom: false } } },
		operations: {
			customer: [
				{
					type: "update_plan",
					plan_filter: { plan_id: plan.id, custom: false },
					customize: {
						remove_items: [{ feature_id: TestFeature.Messages }],
					},
				},
			],
		},
		noBillingChanges: true,
	});

	expect(result?.lane).toBe("batch");
	expect(
		await readEntityRows({
			ctx,
			customerId,
			planId: plan.id,
			featureId: TestFeature.Messages,
		}),
	).toHaveLength(0);
	expect(
		await readEntityRows({
			ctx,
			customerId,
			planId: plan.id,
			featureId: TestFeature.Dashboard,
		}),
	).toHaveLength(ENTITY_COUNT);
});
