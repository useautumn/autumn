/**
 * Resetting the cycle now restarts every item on the Stripe subscription, so plans the request
 * didn't change (other entities' plans, retained undeclared plans) are re-billed the way Stripe would.
 */

import { expect, test } from "bun:test";
import type { ApiCustomerV3, SetPlansParamsV0Input } from "@autumn/shared";
import { expectCustomerInvoiceCorrect } from "@tests/integration/billing/utils/expectCustomerInvoiceCorrect";
import { expectPreviewNextCycleCorrect } from "@tests/integration/billing/utils/expectPreviewNextCycleCorrect";
import { previewStripeTwinResetNowTotal } from "@tests/integration/billing/utils/stripe/previewStripeResetNow";
import { expectBalanceCorrect } from "@tests/integration/utils/expectBalanceCorrect";
import { TestFeature } from "@tests/setup/v2Features";
import { items } from "@tests/utils/fixtures/items";
import { products } from "@tests/utils/fixtures/products";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario";
import chalk from "chalk";
import { addMonths } from "date-fns";
import { Decimal } from "decimal.js";
import { expectStripeCycleCorrect } from "./utils/anchorCycleUtils";

const resetNowPhase = ({
	planIds,
	prorationBehavior,
}: {
	planIds: string[];
	prorationBehavior?: "none";
}): SetPlansParamsV0Input["phases"][number] => ({
	starts_at: "now",
	billing_cycle_anchor: "phase_start",
	...(prorationBehavior && { proration_behavior: prorationBehavior }),
	plans: planIds.map((planId) => ({ plan_id: planId })),
});

const entityPlans = () => ({
	pro: products.pro({
		items: [items.monthlyMessages({ includedUsage: 100 })],
	}),
	premium: products.premium({
		items: [items.monthlyMessages({ includedUsage: 500 })],
	}),
});

const rebillWarningMessage = (warnings: { type: string; message: string }[]) =>
	warnings.find(({ type }) => type === "cycle_reset_rebills_plans")?.message;

test.concurrent(
	`${chalk.yellowBright("set-plans anchor now shared sub: resetting entity 1 re-bills entity 2's plan as Stripe does")}`,
	async () => {
		const { pro, premium } = entityPlans();
		const { customerId, autumnV2_4, ctx, advancedTo, entities } =
			await initScenario({
				customerId: "set-plans-anchor-now-shared-entities",
				setup: [
					s.customer({ paymentMethod: "success" }),
					s.products({ list: [pro, premium] }),
					s.entities({ count: 2, featureId: TestFeature.Users }),
				],
				actions: [
					s.billing.attach({ productId: pro.id, entityIndex: 0 }),
					s.billing.attach({ productId: pro.id, entityIndex: 1 }),
					s.advanceTestClock({ days: 10 }),
					s.track({
						featureId: TestFeature.Messages,
						value: 40,
						entityIndex: 1,
						timeout: 2000,
					}),
				],
			});

		const renewalAt = addMonths(advancedTo, 1).getTime();
		const stripeTotal = await previewStripeTwinResetNowTotal({
			ctx,
			customerId,
			advancedTo,
			changes: [{ removeUnitAmount: 20, addUnitAmount: 50 }],
		});
		const params: SetPlansParamsV0Input = {
			customer_id: customerId,
			entity_id: entities[0].id,
			phases: [resetNowPhase({ planIds: [premium.id] })],
		};

		const preview = await autumnV2_4.billing.previewSetPlans(params);
		expect(preview.total).toBe(stripeTotal);
		expectPreviewNextCycleCorrect({
			preview,
			startsAt: renewalAt,
			total: 70,
			toleranceMs: 1000,
		});
		const rebillWarning = rebillWarningMessage(preview.warnings);
		expect(rebillWarning).toContain("(Entity 2)");
		expect(rebillWarning).not.toContain("(Entity 1)");

		await autumnV2_4.billing.setPlans(params);

		await expectCustomerInvoiceCorrect({
			customerId,
			count: 3,
			latestTotal: stripeTotal,
		});
		await expectStripeCycleCorrect({
			ctx,
			customerId,
			anchorMs: advancedTo,
			periodEndMs: renewalAt,
		});
		await expectBalanceCorrect({
			customerId,
			entityId: entities[0].id,
			featureId: TestFeature.Messages,
			remaining: 500,
			usage: 0,
			nextResetAt: renewalAt,
		});
		await expectBalanceCorrect({
			customerId,
			entityId: entities[1].id,
			featureId: TestFeature.Messages,
			remaining: 100,
			usage: 0,
			nextResetAt: renewalAt,
		});
	},
);

test.concurrent(
	`${chalk.yellowBright("set-plans anchor now shared sub: with proration none, entity 2's plan is re-anchored but not billed, as Stripe does")}`,
	async () => {
		const { pro, premium } = entityPlans();
		const { customerId, autumnV2_4, ctx, advancedTo, entities } =
			await initScenario({
				customerId: "set-plans-anchor-now-shared-none",
				setup: [
					s.customer({ paymentMethod: "success" }),
					s.products({ list: [pro, premium] }),
					s.entities({ count: 2, featureId: TestFeature.Users }),
				],
				actions: [
					s.billing.attach({ productId: pro.id, entityIndex: 0 }),
					s.billing.attach({ productId: pro.id, entityIndex: 1 }),
					s.advanceTestClock({ days: 10 }),
				],
			});

		const renewalAt = addMonths(advancedTo, 1).getTime();
		// Stripe moves an unchanged item's period under none without invoicing it.
		const stripeUnchangedItemsTotal = await previewStripeTwinResetNowTotal({
			ctx,
			customerId,
			advancedTo,
			prorationBehavior: "none",
		});
		// Entity 1's full new period without credit is Autumn's existing `none` rule for the changed plan.
		const expectedTotal = new Decimal(50)
			.plus(stripeUnchangedItemsTotal)
			.toNumber();
		const params: SetPlansParamsV0Input = {
			customer_id: customerId,
			entity_id: entities[0].id,
			phases: [
				resetNowPhase({ planIds: [premium.id], prorationBehavior: "none" }),
			],
		};

		const preview = await autumnV2_4.billing.previewSetPlans(params);
		expect(preview.total).toBe(expectedTotal);
		expect(rebillWarningMessage(preview.warnings)).toBeUndefined();

		await autumnV2_4.billing.setPlans(params);

		await expectCustomerInvoiceCorrect({
			customerId,
			count: 3,
			latestTotal: expectedTotal,
		});
		await expectStripeCycleCorrect({
			ctx,
			customerId,
			anchorMs: advancedTo,
			periodEndMs: renewalAt,
		});
		for (const entity of entities) {
			await expectBalanceCorrect({
				customerId,
				entityId: entity.id,
				featureId: TestFeature.Messages,
				nextResetAt: renewalAt,
			});
		}
	},
);

test.concurrent(
	`${chalk.yellowBright("set-plans anchor now shared sub: a retained undeclared add-on is re-billed and its usage billed and reset")}`,
	async () => {
		const { pro, premium } = entityPlans();
		const addOn = products.base({
			id: "words-addon",
			isAddOn: true,
			items: [
				items.monthlyPrice({ price: 10 }),
				items.consumableWords({ includedUsage: 0 }),
			],
		});
		const { customerId, autumnV1, autumnV2_4, ctx, advancedTo } =
			await initScenario({
				customerId: "set-plans-anchor-now-shared-retained",
				setup: [
					s.customer({ paymentMethod: "success" }),
					s.products({ list: [pro, premium, addOn] }),
				],
				actions: [
					s.billing.attach({ productId: pro.id }),
					s.billing.attach({ productId: addOn.id }),
					s.advanceTestClock({ days: 10 }),
					s.track({ featureId: TestFeature.Words, value: 100, timeout: 2000 }),
				],
			});

		const renewalAt = addMonths(advancedTo, 1).getTime();
		const stripeTotal = await previewStripeTwinResetNowTotal({
			ctx,
			customerId,
			advancedTo,
			changes: [{ removeUnitAmount: 20, addUnitAmount: 50 }],
		});
		// Stripe closes the metered period at the reset; the usage itself is Autumn's: 100 words × $0.05.
		const expectedTotal = new Decimal(stripeTotal).plus(5).toNumber();
		const params: SetPlansParamsV0Input = {
			customer_id: customerId,
			undeclared_plans: "retain",
			phases: [resetNowPhase({ planIds: [premium.id] })],
		};

		const preview = await autumnV2_4.billing.previewSetPlans(params);
		expect(preview.total).toBe(expectedTotal);
		expect(rebillWarningMessage(preview.warnings)).toContain("Words");

		await autumnV2_4.billing.setPlans(params);

		// Stripe closes the metered item's period with its own $0 invoice; the usage is billed once, by Autumn.
		await expectCustomerInvoiceCorrect({ customerId, count: 4 });
		const { invoices } =
			await autumnV1.customers.get<ApiCustomerV3>(customerId);
		expect(
			invoices
				?.slice(0, 2)
				.map(({ total }) => total)
				.sort((first, second) => first - second),
		).toEqual([0, expectedTotal]);
		await expectStripeCycleCorrect({
			ctx,
			customerId,
			anchorMs: advancedTo,
			periodEndMs: renewalAt,
		});
		await expectBalanceCorrect({
			customerId,
			featureId: TestFeature.Words,
			usage: 0,
			nextResetAt: renewalAt,
		});
		await expectBalanceCorrect({
			customerId,
			featureId: TestFeature.Messages,
			remaining: 500,
			usage: 0,
			nextResetAt: renewalAt,
		});
	},
);
