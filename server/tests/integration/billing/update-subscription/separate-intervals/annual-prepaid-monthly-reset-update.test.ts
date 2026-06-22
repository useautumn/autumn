import { expect, test } from "bun:test";
import {
	type ApiCustomerV3,
	type ApiCustomerV5,
	type AttachParamsV1Input,
	BillingInterval,
	BillingMethod,
	type CreatePlanItemParamsV1Input,
	cusEntToCusPrice,
	cusProductToCusEnts,
	EntInterval,
	filterCustomerProductsByFeatureId,
	isConsumablePrice,
	isPrepaidPrice,
	OnDecrease,
	OnIncrease,
	type ProductItem,
	ProductItemInterval,
	productToCusProduct,
	ResetInterval,
	TierBehavior,
	type UpdateSubscriptionV1ParamsInput,
	type UsageTier,
} from "@autumn/shared";
import { expectCustomerInvoiceCorrect } from "@tests/integration/billing/utils/expectCustomerInvoiceCorrect";
import { calculateCrossIntervalUpgrade } from "@tests/integration/billing/utils/proration";
import { expectBalanceCorrect } from "@tests/integration/utils/expectBalanceCorrect";
import { TestFeature } from "@tests/setup/v2Features";
import { items } from "@tests/utils/fixtures/items";
import { products } from "@tests/utils/fixtures/products";
import { advanceTestClock } from "@tests/utils/stripeUtils";
import { advanceToNextInvoice } from "@tests/utils/testAttachUtils/testAttachUtils";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario";
import chalk from "chalk";
import { Decimal } from "decimal.js";
import { CusService } from "@/internal/customers/CusService";
import { constructPrepaidItem } from "@/utils/scriptUtils/constructItem";

const BILLING_UNITS = 100;
const MONTHLY_TIER_1_AMOUNT = 10;
const MONTHLY_TIER_2_AMOUNT = 5;
const ANNUAL_TIER_1_AMOUNT = 120;
const ANNUAL_TIER_2_AMOUNT = 60;
const CONSUMABLE_UNIT_AMOUNT = 0.1;
const TIER_1_LIMIT = 500;
const PREPAID_QUANTITY = 800;
const TRACKED_USAGE = 950;
const OVERAGE_USAGE = TRACKED_USAGE - PREPAID_QUANTITY;

const volumeTiers = ({
	tier1Amount,
	tier2Amount,
}: {
	tier1Amount: number;
	tier2Amount: number;
}) => [
	{ to: TIER_1_LIMIT, amount: tier1Amount },
	{ to: "inf" as const, amount: tier2Amount },
];

const prepaidMessagesProductItem = ({
	priceInterval,
	tier1Amount,
	tier2Amount,
}: {
	priceInterval?: ProductItemInterval;
	tier1Amount: number;
	tier2Amount: number;
}): ProductItem =>
	constructPrepaidItem({
		featureId: TestFeature.Messages,
		tiers: volumeTiers({ tier1Amount, tier2Amount }),
		tierBehaviour: TierBehavior.VolumeBased,
		billingUnits: BILLING_UNITS,
		includedUsage: 0,
		interval: ProductItemInterval.Month,
		priceInterval,
	});

const prepaidMessagesPlanItem = ({
	priceInterval,
	tier1Amount,
	tier2Amount,
}: {
	priceInterval: BillingInterval;
	tier1Amount: number;
	tier2Amount: number;
}): CreatePlanItemParamsV1Input => ({
	feature_id: TestFeature.Messages,
	included: 0,
	reset: { interval: ResetInterval.Month },
	price: {
		tiers: volumeTiers({ tier1Amount, tier2Amount }) as UsageTier[],
		tier_behavior: TierBehavior.VolumeBased,
		interval: priceInterval,
		billing_method: BillingMethod.Prepaid,
		billing_units: BILLING_UNITS,
	},
	proration: {
		on_increase: OnIncrease.ProrateImmediately,
		on_decrease: OnDecrease.ProrateImmediately,
	},
});

const monthlyConsumableMessagesPlanItem = (): CreatePlanItemParamsV1Input => ({
	feature_id: TestFeature.Messages,
	included: 0,
	reset: { interval: ResetInterval.Month },
	price: {
		amount: CONSUMABLE_UNIT_AMOUNT,
		interval: BillingInterval.Month,
		billing_method: BillingMethod.UsageBased,
		billing_units: 1,
	},
});

const expectedVolumeAmount = ({
	quantity,
	tier1Amount,
	tier2Amount,
}: {
	quantity: number;
	tier1Amount: number;
	tier2Amount: number;
}) => {
	const amount = quantity <= TIER_1_LIMIT ? tier1Amount : tier2Amount;
	return new Decimal(quantity).div(BILLING_UNITS).mul(amount).toNumber();
};

const expectedOverageAmount = ({ usage }: { usage: number }) =>
	new Decimal(usage).mul(CONSUMABLE_UNIT_AMOUNT).toNumber();

const expectSeparateMessageEntitlements = async ({
	ctx,
	customerId,
	productId,
}: {
	ctx: Awaited<ReturnType<typeof initScenario>>["ctx"];
	customerId: string;
	productId: string;
}) => {
	const fullCustomer = await CusService.getFull({
		ctx,
		idOrInternalId: customerId,
		skipReset: true,
	});
	const customerProduct = productToCusProduct({
		productId,
		cusProducts: filterCustomerProductsByFeatureId({
			customerProducts: fullCustomer.customer_products,
			featureId: TestFeature.Messages,
		}),
	});
	if (!customerProduct)
		throw new Error(`Expected customer product ${productId}`);

	const messageEntitlements = cusProductToCusEnts({
		customerProduct,
	}).filter((cusEnt) => cusEnt.entitlement.feature_id === TestFeature.Messages);
	const prepaidEntitlements = messageEntitlements.filter((cusEnt) => {
		const customerPrice = cusEntToCusPrice({ cusEnt });
		return customerPrice ? isPrepaidPrice(customerPrice.price) : false;
	});
	const consumableEntitlements = messageEntitlements.filter((cusEnt) => {
		const customerPrice = cusEntToCusPrice({ cusEnt });
		return customerPrice ? isConsumablePrice(customerPrice.price) : false;
	});

	expect(messageEntitlements).toHaveLength(2);
	expect(prepaidEntitlements).toHaveLength(1);
	expect(consumableEntitlements).toHaveLength(1);
	expect(prepaidEntitlements[0]!.entitlement.interval).toBe(EntInterval.Month);
	expect(prepaidEntitlements[0]!.separate_interval).toBe(true);
	expect(prepaidEntitlements[0]!.balance).toBe(PREPAID_QUANTITY);
	expect(consumableEntitlements[0]!.balance).toBe(0);
};

test.concurrent(
	`${chalk.yellowBright("separate intervals: update monthly prepaid volume to annual monthly reset")}`,
	async () => {
		const customerId = "sep-int-annual-volume-update";
		const plan = products.base({
			id: "sep-int-update-pro",
			items: [
				prepaidMessagesProductItem({
					tier1Amount: MONTHLY_TIER_1_AMOUNT,
					tier2Amount: MONTHLY_TIER_2_AMOUNT,
				}),
				items.consumableMessages({
					includedUsage: 0,
					price: CONSUMABLE_UNIT_AMOUNT,
				}),
			],
		});
		const initialMonthlyAmount = expectedVolumeAmount({
			quantity: PREPAID_QUANTITY,
			tier1Amount: MONTHLY_TIER_1_AMOUNT,
			tier2Amount: MONTHLY_TIER_2_AMOUNT,
		});
		const annualAmount = expectedVolumeAmount({
			quantity: PREPAID_QUANTITY,
			tier1Amount: ANNUAL_TIER_1_AMOUNT,
			tier2Amount: ANNUAL_TIER_2_AMOUNT,
		});
		const expectedRenewalTotal = expectedOverageAmount({
			usage: OVERAGE_USAGE,
		});

		const {
			autumnV1,
			autumnV2_2,
			ctx,
			testClockId,
			advancedTo: scenarioStart,
		} = await initScenario({
			customerId,
			setup: [
				s.customer({ testClock: true, paymentMethod: "success" }),
				s.products({ list: [plan] }),
			],
			actions: [],
		});
		if (!testClockId)
			throw new Error("Expected test clock for renewal invoice");

		await autumnV2_2.billing.attach<AttachParamsV1Input>({
			customer_id: customerId,
			plan_id: plan.id,
			feature_quantities: [
				{ feature_id: TestFeature.Messages, quantity: PREPAID_QUANTITY },
			],
			redirect_mode: "if_required",
		});
		const advancedTo = await advanceTestClock({
			stripeCli: ctx.stripeCli,
			testClockId,
			startingFrom: new Date(scenarioStart),
			numberOfDays: 14,
			waitForSeconds: 30,
		});

		const expectedProrationTotal = await calculateCrossIntervalUpgrade({
			customerId,
			advancedTo,
			oldAmount: initialMonthlyAmount,
			newAmount: annualAmount,
			oldInterval: "month",
			newInterval: BillingInterval.Year,
		});
		const updateParams: UpdateSubscriptionV1ParamsInput = {
			customer_id: customerId,
			plan_id: plan.id,
			customize: {
				items: [
					prepaidMessagesPlanItem({
						priceInterval: BillingInterval.Year,
						tier1Amount: ANNUAL_TIER_1_AMOUNT,
						tier2Amount: ANNUAL_TIER_2_AMOUNT,
					}),
					monthlyConsumableMessagesPlanItem(),
				],
			},
			feature_quantities: [
				{ feature_id: TestFeature.Messages, quantity: PREPAID_QUANTITY },
			],
			redirect_mode: "if_required",
		};

		const preview =
			await autumnV2_2.subscriptions.previewUpdate<UpdateSubscriptionV1ParamsInput>(
				updateParams,
			);
		expect(preview.total).toBeCloseTo(expectedProrationTotal, 0);
		await autumnV2_2.subscriptions.update<UpdateSubscriptionV1ParamsInput>(
			updateParams,
		);

		let customerV3 = await autumnV1.customers.get<ApiCustomerV3>(customerId);
		await expectCustomerInvoiceCorrect({
			customer: customerV3,
			count: 2,
			latestTotal: preview.total,
		});
		await expectSeparateMessageEntitlements({
			ctx,
			customerId,
			productId: plan.id,
		});

		const trackResponse = await autumnV2_2.track(
			{
				customer_id: customerId,
				feature_id: TestFeature.Messages,
				value: TRACKED_USAGE,
				timestamp: advancedTo,
			},
			{
				skipCache: true,
				timeout: 2000,
			},
		);
		expect(trackResponse.balance.remaining).toBe(0);
		const customerV5 = await autumnV2_2.customers.get<ApiCustomerV5>(
			customerId,
			{
				skip_cache: "true",
			},
		);
		expectBalanceCorrect({
			customer: customerV5,
			featureId: TestFeature.Messages,
			remaining: 0,
			usage: TRACKED_USAGE,
			planId: plan.id,
		});

		await advanceToNextInvoice({
			stripeCli: ctx.stripeCli,
			testClockId,
			currentEpochMs: advancedTo,
			withPause: true,
		});

		customerV3 = await autumnV1.customers.get<ApiCustomerV3>(customerId, {
			skip_cache: "true",
		});
		await expectCustomerInvoiceCorrect({
			customer: customerV3,
			count: 3,
			latestTotal: expectedRenewalTotal,
		});
		await expectSeparateMessageEntitlements({
			ctx,
			customerId,
			productId: plan.id,
		});
		expectBalanceCorrect({
			customer: await autumnV2_2.customers.get<ApiCustomerV5>(customerId, {
				skip_cache: "true",
			}),
			featureId: TestFeature.Messages,
			remaining: PREPAID_QUANTITY,
			usage: 0,
			planId: plan.id,
		});
	},
);
