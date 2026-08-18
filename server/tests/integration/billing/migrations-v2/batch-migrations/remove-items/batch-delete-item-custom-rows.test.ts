/**
 * A delete must reach customers whose row points at a custom definition of
 * the same item, and must spare one whose custom definition means something
 * different.
 *
 * customer_entitlements can point at a custom or older-version entitlement
 * that composeFullProductQuery filters out, so resolving by catalog id alone
 * leaves those customers holding the item. Discovery is by feature and
 * `entsAreSame` decides what counts as the same item.
 *
 * Red (catalog-id only): the same-meaning custom row survives the delete.
 * Green: it is removed, and the different-allowance one is not.
 */
import { expect, test } from "bun:test";
import { customerEntitlements } from "@autumn/shared";
import { runChunkedMigration } from "@tests/integration/billing/migrations-v2/utils/runChunkedMigration";
import { TestFeature } from "@tests/setup/v2Features";
import { itemsV2 } from "@tests/utils/fixtures/itemsV2";
import { products } from "@tests/utils/fixtures/products";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario";
import chalk from "chalk";
import { and, eq } from "drizzle-orm";
import { repointToCustomEntitlement } from "../paidRowTestUtils";

const MESSAGES_INCLUDED = 100;
const DIFFERENT_ALLOWANCE = 500;
const PLAN_PREFIX = "batch-delete-custom";

test(`${chalk.yellowBright("batch migration: a delete reaches same-meaning custom rows and spares different ones")}`, async () => {
	const catalogCustomerId = "batch-delete-custom-catalog";
	const sameMeaningCustomerId = "batch-delete-custom-same";
	const differentCustomerId = "batch-delete-custom-different";
	const plan = products.base({
		id: "batch-delete-custom-plan",
		items: [
			itemsV2.dashboard(),
			itemsV2.monthlyMessages({ included: MESSAGES_INCLUDED }),
		],
	});

	const { ctx, autumnV2_2 } = await initScenario({
		customerId: catalogCustomerId,
		setup: [
			s.customer({ testClock: false }),
			s.otherCustomers([
				{ id: sameMeaningCustomerId },
				{ id: differentCustomerId },
			]),
			s.products({ list: [plan], prefix: PLAN_PREFIX }),
		],
		actions: [
			s.parallel(
				s.attach({ productId: plan.id }),
				s.attach({
					customerId: sameMeaningCustomerId,
					productId: plan.id,
				}),
				s.attach({
					customerId: differentCustomerId,
					productId: plan.id,
				}),
			),
		],
	});
	// s.products mutates plan.id with the prefix during setup.
	const planId = plan.id;

	// An exact copy: the same item under a custom id.
	await repointToCustomEntitlement({
		ctx,
		customerId: sameMeaningCustomerId,
		featureId: TestFeature.Messages,
	});
	// A different allowance makes it a distinct item that survives.
	await repointToCustomEntitlement({
		ctx,
		customerId: differentCustomerId,
		featureId: TestFeature.Messages,
		overrides: { allowance: DIFFERENT_ALLOWANCE },
	});

	const { result } = await runChunkedMigration({
		ctx,
		migrationClient: autumnV2_2,
		migrationId: "batch-delete-custom-migration",
		filter: { customer: { plan: { plan_id: planId, custom: false } } },
		operations: {
			customer: [
				{
					type: "update_plan",
					plan_filter: { plan_id: planId, custom: false },
					customize: {
						remove_items: [{ feature_id: TestFeature.Messages }],
					},
				},
			],
		},
		noBillingChanges: true,
	});

	expect({
		lane: result?.lane,
		rejections: (result?.rejections ?? []).map(
			(r) => `${r.code}: ${r.message}`,
		),
	}).toEqual({ lane: "batch", rejections: [] });

	const messageRowsFor = async (customerId: string) =>
		ctx.db
			.select({ id: customerEntitlements.id })
			.from(customerEntitlements)
			.where(
				and(
					eq(customerEntitlements.customer_id, customerId),
					eq(customerEntitlements.feature_id, TestFeature.Messages),
				),
			);

	// ── The catalog row and the same-meaning custom row both go ────────
	expect(await messageRowsFor(catalogCustomerId)).toHaveLength(0);
	expect(await messageRowsFor(sameMeaningCustomerId)).toHaveLength(0);

	// ── A custom row meaning something else survives ───────────────────
	expect(await messageRowsFor(differentCustomerId)).toHaveLength(1);
});
