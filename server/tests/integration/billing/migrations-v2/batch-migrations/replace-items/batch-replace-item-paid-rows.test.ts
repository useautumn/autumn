/**
 * An allowance edit (100 → 200 messages, expressed as remove + add) must
 * spare rows the customer actually pays for, in both shapes a free→paid
 * customization leaves behind:
 *  - a custom price hung off the SHARED catalog entitlement id, and
 *  - a custom price hung off a field-identical custom entitlement copy.
 *
 * Repointing a paid row to the new free definition would strand the
 * customer_price against a definition the row no longer holds, and credit a
 * delta the customer never bought.
 *
 * Red: both paid rows are repointed to the new definition.
 * Green: both keep their original definition and price; only the plain
 * catalog row is replaced.
 */
import { expect, test } from "bun:test";
import { runChunkedMigration } from "@tests/integration/billing/migrations-v2/utils/runChunkedMigration";
import { TestFeature } from "@tests/setup/v2Features";
import { items } from "@tests/utils/fixtures/items";
import { itemsV2 } from "@tests/utils/fixtures/itemsV2";
import { products } from "@tests/utils/fixtures/products";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario";
import chalk from "chalk";
import {
	attachCustomerPaidPrice,
	expectCustomerPriceSurvives,
	readScopedFeatureRow,
	repointToCustomEntitlement,
} from "../paidRowTestUtils";

const MESSAGES_INCLUDED = 100;
const NEW_MESSAGES_INCLUDED = 200;
const PLAN_PREFIX = "batch-replace-paid";

const readMessagesRow = async ({
	ctx,
	customerId,
}: {
	ctx: Awaited<ReturnType<typeof initScenario>>["ctx"];
	customerId: string;
}) => {
	const row = await readScopedFeatureRow({
		ctx,
		customerId,
		featureId: TestFeature.Messages,
	});
	return {
		id: row.id,
		entitlementId: row.entitlement_id,
		balance: row.balance,
	};
};

test(`${chalk.yellowBright("batch migration: a replace spares rows the customer pays for")}`, async () => {
	const catalogCustomerId = "batch-replace-paid-catalog";
	const sharedPaidCustomerId = "batch-replace-paid-shared";
	const customPaidCustomerId = "batch-replace-paid-custom";
	const plan = products.base({
		id: "batch-replace-paid-plan",
		items: [
			itemsV2.dashboard(),
			itemsV2.monthlyMessages({ included: MESSAGES_INCLUDED }),
		],
	});
	// Attached to nobody — exists only so a valid usage price can be cloned.
	const paidTemplate = products.base({
		id: "batch-replace-paid-template",
		items: [items.consumableMessages()],
	});

	const { ctx, autumnV2_2 } = await initScenario({
		customerId: catalogCustomerId,
		setup: [
			s.customer({ testClock: false }),
			s.otherCustomers([
				{ id: sharedPaidCustomerId },
				{ id: customPaidCustomerId },
			]),
			s.products({ list: [plan, paidTemplate], prefix: PLAN_PREFIX }),
		],
		actions: [
			s.parallel(
				s.attach({ productId: plan.id }),
				s.attach({
					customerId: sharedPaidCustomerId,
					productId: plan.id,
				}),
				s.attach({
					customerId: customPaidCustomerId,
					productId: plan.id,
				}),
			),
		],
	});
	const planId = plan.id;

	// Shape 1: paid price on the shared catalog entitlement id.
	const sharedPaid = await attachCustomerPaidPrice({
		ctx,
		customerId: sharedPaidCustomerId,
		featureId: TestFeature.Messages,
		templatePlanId: paidTemplate.id,
	});

	// Shape 2: field-identical custom copy, paid price on the copy.
	await repointToCustomEntitlement({
		ctx,
		customerId: customPaidCustomerId,
		featureId: TestFeature.Messages,
	});
	const customPaid = await attachCustomerPaidPrice({
		ctx,
		customerId: customPaidCustomerId,
		featureId: TestFeature.Messages,
		templatePlanId: paidTemplate.id,
	});

	const catalogBefore = await readMessagesRow({
		ctx,
		customerId: catalogCustomerId,
	});
	const sharedPaidBefore = await readMessagesRow({
		ctx,
		customerId: sharedPaidCustomerId,
	});
	const customPaidBefore = await readMessagesRow({
		ctx,
		customerId: customPaidCustomerId,
	});

	const { result } = await runChunkedMigration({
		ctx,
		migrationClient: autumnV2_2,
		migrationId: "batch-replace-paid-migration",
		filter: { customer: { plan: { plan_id: planId, custom: false } } },
		operations: {
			customer: [
				{
					type: "update_plan",
					plan_filter: { plan_id: planId, custom: false },
					customize: {
						add_items: [
							itemsV2.monthlyMessages({ included: NEW_MESSAGES_INCLUDED }),
						],
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

	// ── The plain catalog row is replaced in place ───────────────────────
	// Balance-delta semantics live in batch-plan-item-replace.test.ts.
	const catalogAfter = await readMessagesRow({
		ctx,
		customerId: catalogCustomerId,
	});
	expect(catalogAfter.id).toBe(catalogBefore.id);
	expect(catalogAfter.entitlementId).not.toBe(catalogBefore.entitlementId);

	// ── Both paid rows keep their definition and price ───────────────────
	const sharedPaidAfter = await readMessagesRow({
		ctx,
		customerId: sharedPaidCustomerId,
	});
	expect(sharedPaidAfter.entitlementId).toBe(sharedPaidBefore.entitlementId);

	const customPaidAfter = await readMessagesRow({
		ctx,
		customerId: customPaidCustomerId,
	});
	expect(customPaidAfter.entitlementId).toBe(customPaidBefore.entitlementId);

	await expectCustomerPriceSurvives({
		ctx,
		customerPriceId: sharedPaid.customerPriceId,
	});
	await expectCustomerPriceSurvives({
		ctx,
		customerPriceId: customPaid.customerPriceId,
	});
});
