/**
 * Volume where the reset interval differs from the billing interval, and volume with rollovers.
 * Usage-based volume can't split reset and price intervals (400); prepaid volume can.
 */

import { expect, test } from "bun:test";
import {
	type ApiCustomerV3,
	type ApiPlanV1,
	ApiVersion,
	BillingInterval,
	BillingMethod,
	type CreatePlanParamsV2Input,
	ErrCode,
	ResetInterval,
	RolloverExpiryDurationType,
	TierBehavior,
} from "@autumn/shared";
import { expectNextInvoiceMatchesPreview } from "@tests/integration/billing/utils/expectNextInvoiceMatchesPreview";
import { expectBalanceCorrect } from "@tests/integration/utils/expectBalanceCorrect";
import { TestFeature } from "@tests/setup/v2Features";
import { expireCusEntForReset } from "@tests/utils/cusProductUtils/resetTestUtils";
import { expectAutumnError } from "@tests/utils/expectUtils/expectErrUtils";
import { items } from "@tests/utils/fixtures/items";
import { products } from "@tests/utils/fixtures/products";
import { timeout } from "@tests/utils/genUtils";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario";
import chalk from "chalk";
import { addMonths } from "date-fns";
import { AutumnRpcCli } from "@/external/autumn/autumnRpcCli.js";
import {
	expectVolumeRenewalCorrect,
	getInvoicePreview,
	sumFeatureSubtotal,
} from "./utils/volumeAdversarialUtils";

const autumnRpc = new AutumnRpcCli({ version: ApiVersion.V2_1 });
const getSuffix = () => Math.random().toString(36).slice(2, 9);

const volumeTiers = [
	{ to: 500, amount: 10 },
	{ to: "inf" as const, amount: 5 },
];

test.concurrent(
	`${chalk.yellowBright("volume-intervals 1: usage-based volume with a weekly reset on a monthly price → 400")}`,
	async () => {
		const planId = `vol_adv_split_ppu_${getSuffix()}`;
		await expectAutumnError({
			errCode: ErrCode.InvalidInputs,
			errMessage: "reset.interval and price.interval can only differ",
			func: () =>
				autumnRpc.plans.create<ApiPlanV1, CreatePlanParamsV2Input>({
					plan_id: planId,
					name: planId,
					auto_enable: false,
					items: [
						{
							feature_id: TestFeature.Messages,
							included: 100,
							reset: { interval: ResetInterval.Week },
							price: {
								interval: BillingInterval.Month,
								billing_method: BillingMethod.UsageBased,
								tier_behavior: TierBehavior.VolumeBased,
								tiers: [
									{ to: 500, amount: 0.1 },
									{ to: "inf", amount: 0.05 },
								],
							},
						},
					],
				}),
		});
	},
);

test.concurrent(
	`${chalk.yellowBright("volume-intervals 2: quarterly prepaid volume, monthly reset: resets don't invoice, renewal = preview = 6 packs × $5")}`,
	async () => {
		const planId = `vol_adv_split_prepaid_${getSuffix()}`;
		await autumnRpc.plans.create<ApiPlanV1, CreatePlanParamsV2Input>({
			plan_id: planId,
			name: planId,
			group: `grp_${planId}`,
			auto_enable: false,
			items: [
				{
					feature_id: TestFeature.Messages,
					included: 0,
					reset: { interval: ResetInterval.Month },
					price: {
						interval: BillingInterval.Quarter,
						billing_units: 100,
						billing_method: BillingMethod.Prepaid,
						tier_behavior: TierBehavior.VolumeBased,
						tiers: volumeTiers,
					},
				},
			],
		});

		const scenario = await initScenario({
			customerId: "vol-adv-split-prepaid",
			setup: [s.customer({ paymentMethod: "success" })],
			actions: [],
		});
		const { customerId, autumnV1 } = scenario;
		await autumnV1.billing.attach({
			customer_id: customerId,
			product_id: planId,
			redirect_mode: "if_required",
			options: [{ feature_id: TestFeature.Messages, quantity: 600 }],
		});

		// 600 bought = 6 packs > 500: 6 × $5 = $30
		const afterAttach = await autumnV1.customers.get<ApiCustomerV3>(customerId);
		expect(afterAttach.invoices?.[0]?.total).toBeCloseTo(30, 2);

		await autumnV1.track(
			{ customer_id: customerId, feature_id: TestFeature.Messages, value: 450 },
			{ timeout: 3000 },
		);
		// Server-side resets run on real time, so force the monthly reset due now
		await expireCusEntForReset({
			ctx: scenario.ctx,
			customerId,
			featureId: TestFeature.Messages,
		});
		await scenario.autumnV2_2.customers.get(customerId, { skip_cache: "true" });

		// The monthly reset restores the 600 without invoicing
		await expectBalanceCorrect({
			customerId,
			featureId: TestFeature.Messages,
			remaining: 600,
			usage: 0,
		});
		const afterReset = await autumnV1.customers.get<ApiCustomerV3>(customerId);
		expect(afterReset.invoices).toHaveLength(1);

		const preview = await getInvoicePreview({ scenario });
		expect(
			sumFeatureSubtotal({
				lineItems: preview.line_items,
				featureId: TestFeature.Messages,
			}),
		).toBeCloseTo(30, 2);

		// The helper renews one month after `cycleStart`, so start two months in to reach the quarter end
		const { renewalInvoice } = await expectNextInvoiceMatchesPreview({
			ctx: scenario.ctx,
			autumnV1,
			autumnV2_2: scenario.autumnV2_2,
			customerId,
			testClockId: scenario.testClockId!,
			advancedTo: addMonths(new Date(scenario.advancedTo), 2).getTime(),
			featureId: TestFeature.Messages,
			expectedFeatureAmount: 30,
		});
		expect(renewalInvoice.total).toBeCloseTo(30, 2);
	},
);

test.concurrent(
	`${chalk.yellowBright("volume-intervals 3: rollover + volume: 60 rolled over, 200 used next cycle → 40 overage × $0.10 = $4")}`,
	async () => {
		const customerId = "vol-adv-rollover";
		const volumeItem = items.volumeConsumableMessages({ includedUsage: 100 });
		const pro = products.pro({
			id: customerId,
			items: [
				{
					...volumeItem,
					config: {
						...volumeItem.config,
						rollover: {
							max: 1000,
							length: 1,
							duration: RolloverExpiryDurationType.Month,
						},
					},
				},
			],
		});
		const scenario = await initScenario({
			customerId,
			setup: [
				s.customer({ paymentMethod: "success" }),
				s.products({ list: [pro] }),
			],
			actions: [
				s.billing.attach({ productId: pro.id }),
				s.track({
					featureId: TestFeature.Messages,
					value: 40,
					timeout: 3000,
				}),
			],
		});

		// Cycle 1: 40 ≤ 100 included → $0, and the unused 60 rolls over
		await expectNextInvoiceMatchesPreview({
			ctx: scenario.ctx,
			autumnV1: scenario.autumnV1,
			autumnV2_2: scenario.autumnV2_2,
			customerId,
			testClockId: scenario.testClockId!,
			advancedTo: scenario.advancedTo,
			featureId: TestFeature.Messages,
			expectedFeatureAmount: 0,
		});
		await expectBalanceCorrect({
			customerId,
			featureId: TestFeature.Messages,
			remaining: 160,
			rollovers: [{ balance: 60 }],
		});

		await scenario.autumnV2_2.track({
			customer_id: customerId,
			feature_id: TestFeature.Messages,
			value: 200,
		});
		await timeout(3000);

		// 200 used − 100 included − 60 rollover = 40 overage in band 101-600: 40 × $0.10 = $4
		await expectVolumeRenewalCorrect({
			scenario,
			expectedFeatureAmount: 4,
			cycleStart: addMonths(new Date(scenario.advancedTo), 1).getTime(),
		});
	},
);
