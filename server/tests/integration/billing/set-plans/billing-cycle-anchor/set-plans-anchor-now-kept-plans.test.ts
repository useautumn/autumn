/**
 * Resetting the cycle now restarts every plan on the subscription, so plans the request keeps are
 * billed like changed ones: unused time credited, a full new period charged, balances re-anchored.
 */

import { expect, test } from "bun:test";
import type { ApiCustomerV3, SetPlansParamsV0Input } from "@autumn/shared";
import { expectCustomerInvoiceCorrect } from "@tests/integration/billing/utils/expectCustomerInvoiceCorrect";
import { expectPreviewNextCycleCorrect } from "@tests/integration/billing/utils/expectPreviewNextCycleCorrect";
import { calculateResetBillingCycleNowTotal } from "@tests/integration/billing/utils/proration";
import { expectBalanceCorrect } from "@tests/integration/utils/expectBalanceCorrect";
import { TestFeature } from "@tests/setup/v2Features";
import { items } from "@tests/utils/fixtures/items";
import { products } from "@tests/utils/fixtures/products";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario";
import chalk from "chalk";
import { addMonths, addYears } from "date-fns";
import { Decimal } from "decimal.js";
import {
	calculateItemResetNowTotal,
	expectStripeCycleCorrect,
	expectStripeItemPeriodEnd,
} from "./utils/anchorCycleUtils";

const resetNowPhase = ({
	planIds,
	prorationBehavior,
}: {
	planIds: string[];
	prorationBehavior?: "none" | "bill_difference";
}): SetPlansParamsV0Input["phases"][number] => ({
	starts_at: "now",
	billing_cycle_anchor: "phase_start",
	...(prorationBehavior && { proration_behavior: prorationBehavior }),
	plans: planIds.map((planId) => ({ plan_id: planId })),
});

const pro540 = () =>
	products.base({
		id: "pro540",
		items: [
			items.monthlyPrice({ price: 540 }),
			items.monthlyMessages({ includedUsage: 1000 }),
		],
	});
const business = () =>
	products.base({
		id: "business",
		items: [
			items.monthlyPrice({ price: 1000 }),
			items.monthlyMessages({ includedUsage: 5000 }),
		],
	});
const sso = () =>
	products.base({
		id: "sso",
		isAddOn: true,
		items: [items.annualPrice({ price: 2400 })],
	});

test.concurrent(
	`${chalk.yellowBright("set-plans anchor now kept: the same plan with proration none charges a full new period and no credit")}`,
	async () => {
		const pro = products.pro({
			items: [items.monthlyMessages({ includedUsage: 100 })],
		});
		const { customerId, autumnV2_4, ctx, advancedTo } = await initScenario({
			customerId: "set-plans-anchor-now-kept-none",
			setup: [
				s.customer({ paymentMethod: "success" }),
				s.products({ list: [pro] }),
			],
			actions: [
				s.billing.attach({ productId: pro.id }),
				s.advanceTestClock({ days: 10 }),
				s.track({ featureId: TestFeature.Messages, value: 40, timeout: 2000 }),
			],
		});

		const renewalAt = addMonths(advancedTo, 1).getTime();
		const params: SetPlansParamsV0Input = {
			customer_id: customerId,
			phases: [resetNowPhase({ planIds: [pro.id], prorationBehavior: "none" })],
		};

		const preview = await autumnV2_4.billing.previewSetPlans(params);
		expect(preview.total).toBe(20);
		expectPreviewNextCycleCorrect({
			preview,
			startsAt: renewalAt,
			total: 20,
			toleranceMs: 1000,
		});

		await autumnV2_4.billing.setPlans(params);

		await expectCustomerInvoiceCorrect({
			customerId,
			count: 2,
			latestTotal: 20,
		});
		await expectStripeCycleCorrect({
			ctx,
			customerId,
			anchorMs: advancedTo,
			periodEndMs: renewalAt,
		});
		await expectBalanceCorrect({
			customerId,
			featureId: TestFeature.Messages,
			remaining: 100,
			usage: 0,
			nextResetAt: renewalAt,
		});
	},
);

test.concurrent(
	`${chalk.yellowBright("set-plans anchor now kept: a monthly plan and an annual add-on both kept are each credited and recharged")}`,
	async () => {
		const pro = pro540();
		const addOn = sso();
		const { customerId, autumnV2_4, ctx, advancedTo } = await initScenario({
			customerId: "set-plans-anchor-now-kept-mixed",
			setup: [
				s.customer({ paymentMethod: "success" }),
				s.products({ list: [pro, addOn] }),
			],
			actions: [
				s.billing.attach({ productId: pro.id }),
				s.billing.attach({ productId: addOn.id }),
				s.advanceTestClock({ days: 14 }),
			],
		});

		const renewalAt = addMonths(advancedTo, 1).getTime();
		const [monthlyTotal, annualTotal] = await Promise.all([
			calculateItemResetNowTotal({
				ctx,
				customerId,
				advancedTo,
				interval: "month",
				oldAmount: 540,
				newAmount: 540,
			}),
			calculateItemResetNowTotal({
				ctx,
				customerId,
				advancedTo,
				interval: "year",
				oldAmount: 2400,
				newAmount: 2400,
			}),
		]);
		const expectedTotal = new Decimal(monthlyTotal)
			.plus(annualTotal)
			.toNumber();
		const params: SetPlansParamsV0Input = {
			customer_id: customerId,
			phases: [resetNowPhase({ planIds: [pro.id, addOn.id] })],
		};

		const preview = await autumnV2_4.billing.previewSetPlans(params);
		expect(preview.total).toBe(expectedTotal);
		expectPreviewNextCycleCorrect({
			preview,
			startsAt: renewalAt,
			total: 540,
			toleranceMs: 1000,
		});

		await autumnV2_4.billing.setPlans(params);

		await expectCustomerInvoiceCorrect({
			customerId,
			count: 3,
			latestTotal: expectedTotal,
		});
		await expectStripeItemPeriodEnd({
			ctx,
			customerId,
			interval: "month",
			periodEndMs: renewalAt,
		});
		await expectStripeItemPeriodEnd({
			ctx,
			customerId,
			interval: "year",
			periodEndMs: addYears(advancedTo, 1).getTime(),
		});
		await expectBalanceCorrect({
			customerId,
			featureId: TestFeature.Messages,
			remaining: 1000,
			nextResetAt: renewalAt,
		});
	},
);

test.concurrent(
	`${chalk.yellowBright("set-plans anchor now kept: an upgrade beside a kept annual add-on bills the add-on's reset too")}`,
	async () => {
		const pro = pro540();
		const businessPlan = business();
		const addOn = sso();
		const { customerId, autumnV2_4, ctx, advancedTo } = await initScenario({
			customerId: "set-plans-anchor-now-kept-mixed-upgrade",
			setup: [
				s.customer({ paymentMethod: "success" }),
				s.products({ list: [pro, businessPlan, addOn] }),
			],
			actions: [
				s.billing.attach({ productId: pro.id }),
				s.billing.attach({ productId: addOn.id }),
				s.advanceTestClock({ days: 14 }),
			],
		});

		const renewalAt = addMonths(advancedTo, 1).getTime();
		const [monthlyTotal, annualTotal] = await Promise.all([
			calculateItemResetNowTotal({
				ctx,
				customerId,
				advancedTo,
				interval: "month",
				oldAmount: 540,
				newAmount: 1000,
			}),
			calculateItemResetNowTotal({
				ctx,
				customerId,
				advancedTo,
				interval: "year",
				oldAmount: 2400,
				newAmount: 2400,
			}),
		]);
		const expectedTotal = new Decimal(monthlyTotal)
			.plus(annualTotal)
			.toNumber();
		const params: SetPlansParamsV0Input = {
			customer_id: customerId,
			phases: [resetNowPhase({ planIds: [businessPlan.id, addOn.id] })],
		};

		const preview = await autumnV2_4.billing.previewSetPlans(params);
		expect(preview.total).toBe(expectedTotal);
		expectPreviewNextCycleCorrect({
			preview,
			startsAt: renewalAt,
			total: 1000,
			toleranceMs: 1000,
		});

		await autumnV2_4.billing.setPlans(params);

		await expectCustomerInvoiceCorrect({
			customerId,
			count: 3,
			latestTotal: expectedTotal,
		});
		await expectStripeItemPeriodEnd({
			ctx,
			customerId,
			interval: "month",
			periodEndMs: renewalAt,
		});
		await expectStripeItemPeriodEnd({
			ctx,
			customerId,
			interval: "year",
			periodEndMs: addYears(advancedTo, 1).getTime(),
		});
		await expectBalanceCorrect({
			customerId,
			featureId: TestFeature.Messages,
			remaining: 5000,
			nextResetAt: renewalAt,
		});
	},
);

test.concurrent(
	`${chalk.yellowBright("set-plans anchor now kept: the same plan bills its accrued usage and resets it")}`,
	async () => {
		const proUsage = products.pro({
			id: "pro-usage",
			items: [items.consumableMessages({ includedUsage: 0 })],
		});
		const { customerId, autumnV1, autumnV2_4, ctx, advancedTo } =
			await initScenario({
				customerId: "set-plans-anchor-now-kept-usage",
				setup: [
					s.customer({ paymentMethod: "success" }),
					s.products({ list: [proUsage] }),
				],
				actions: [
					s.billing.attach({ productId: proUsage.id }),
					s.track({
						featureId: TestFeature.Messages,
						value: 100,
						timeout: 2000,
					}),
					s.advanceTestClock({ days: 10 }),
				],
			});

		const renewalAt = addMonths(advancedTo, 1).getTime();
		const baseTotal = await calculateResetBillingCycleNowTotal({
			customerId,
			advancedTo,
			oldAmount: 20,
			newAmount: 20,
		});
		const expectedTotal = new Decimal(baseTotal).plus(10).toNumber();
		const params: SetPlansParamsV0Input = {
			customer_id: customerId,
			phases: [resetNowPhase({ planIds: [proUsage.id] })],
		};

		const preview = await autumnV2_4.billing.previewSetPlans(params);
		expect(preview.total).toBe(expectedTotal);

		await autumnV2_4.billing.setPlans(params);

		// Stripe closes the metered item's period with its own $0 invoice; the usage is billed once, by Autumn.
		await expectCustomerInvoiceCorrect({ customerId, count: 3 });
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
			featureId: TestFeature.Messages,
			usage: 0,
			nextResetAt: renewalAt,
		});
	},
);

test.concurrent(
	`${chalk.yellowBright("set-plans anchor now kept: resetting one entity's plan re-anchors the other entity's plan on the subscription")}`,
	async () => {
		const pro = products.pro({
			items: [items.monthlyMessages({ includedUsage: 100 })],
		});
		const premium = products.premium({
			items: [items.monthlyMessages({ includedUsage: 500 })],
		});
		const { customerId, autumnV2_4, ctx, advancedTo, entities } =
			await initScenario({
				customerId: "set-plans-anchor-now-kept-entities",
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
		const expectedTotal = await calculateResetBillingCycleNowTotal({
			customerId,
			advancedTo,
			oldAmount: 20,
			newAmount: 50,
		});
		const params: SetPlansParamsV0Input = {
			customer_id: customerId,
			entity_id: entities[0].id,
			phases: [resetNowPhase({ planIds: [premium.id] })],
		};

		const preview = await autumnV2_4.billing.previewSetPlans(params);
		expect(preview.total).toBe(expectedTotal);

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
	`${chalk.yellowBright("set-plans anchor now kept: bill_difference on the same plan still bills the days already used")}`,
	async () => {
		const pro = products.pro({
			items: [items.monthlyMessages({ includedUsage: 100 })],
		});
		const { customerId, autumnV2_4, ctx, advancedTo } = await initScenario({
			customerId: "set-plans-anchor-now-kept-bill-difference",
			setup: [
				s.customer({ paymentMethod: "success" }),
				s.products({ list: [pro] }),
			],
			actions: [
				s.billing.attach({ productId: pro.id }),
				s.advanceTestClock({ days: 10 }),
			],
		});

		const renewalAt = addMonths(advancedTo, 1).getTime();
		const expectedTotal = await calculateResetBillingCycleNowTotal({
			customerId,
			advancedTo,
			oldAmount: 20,
			newAmount: 20,
		});
		const params: SetPlansParamsV0Input = {
			customer_id: customerId,
			phases: [
				resetNowPhase({
					planIds: [pro.id],
					prorationBehavior: "bill_difference",
				}),
			],
		};

		const preview = await autumnV2_4.billing.previewSetPlans(params);
		expect(preview.total).toBe(expectedTotal);

		await autumnV2_4.billing.setPlans(params);

		await expectCustomerInvoiceCorrect({
			customerId,
			count: 2,
			latestTotal: expectedTotal,
		});
		await expectStripeCycleCorrect({
			ctx,
			customerId,
			anchorMs: advancedTo,
			periodEndMs: renewalAt,
		});
	},
);
