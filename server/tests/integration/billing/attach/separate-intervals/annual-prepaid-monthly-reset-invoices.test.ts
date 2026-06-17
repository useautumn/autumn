import { expect, test } from "bun:test";
import {
	type ApiCustomerV3,
	type ApiCustomerV5,
	type AttachParamsV1Input,
	cusEntToCusPrice,
	cusProductToCusEnts,
	EntInterval,
	filterCustomerProductsByFeatureId,
	isConsumablePrice,
	isPrepaidPrice,
	type ProductItem,
	ProductItemInterval,
	productToCusProduct,
	TierBehavior,
} from "@autumn/shared";
import { expectCustomerInvoiceCorrect } from "@tests/integration/billing/utils/expectCustomerInvoiceCorrect";
import { expectCustomerProducts } from "@tests/integration/billing/utils/expectCustomerProductCorrect";
import { expectBalanceCorrect } from "@tests/integration/utils/expectBalanceCorrect";
import { TestFeature } from "@tests/setup/v2Features";
import { items } from "@tests/utils/fixtures/items";
import { products } from "@tests/utils/fixtures/products";
import { advanceToNextInvoice } from "@tests/utils/testAttachUtils/testAttachUtils";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario";
import chalk from "chalk";
import { Decimal } from "decimal.js";
import { CusService } from "@/internal/customers/CusService";
import { constructPrepaidItem } from "@/utils/scriptUtils/constructItem";

const BILLING_UNITS = 100;
const ANNUAL_TIER_1_AMOUNT = 120;
const ANNUAL_TIER_2_AMOUNT = 60;
const PREMIUM_ANNUAL_TIER_2_AMOUNT = 75;
const CONSUMABLE_UNIT_AMOUNT = 0.1;
const TIER_1_LIMIT = 500;
const PREPAID_QUANTITY = 800;
const TRACKED_USAGE = 950;
const OVERAGE_USAGE = TRACKED_USAGE - PREPAID_QUANTITY;

const annualVolumeTiers = ({
	tier2Amount = ANNUAL_TIER_2_AMOUNT,
}: {
	tier2Amount?: number;
} = {}) => [
	{ to: TIER_1_LIMIT, amount: ANNUAL_TIER_1_AMOUNT },
	{ to: "inf" as const, amount: tier2Amount },
];

const annualVolumePrepaidMessages = ({
	tier2Amount,
}: {
	tier2Amount?: number;
} = {}): ProductItem =>
	constructPrepaidItem({
		featureId: TestFeature.Messages,
		tiers: annualVolumeTiers({ tier2Amount }),
		tierBehaviour: TierBehavior.VolumeBased,
		billingUnits: BILLING_UNITS,
		includedUsage: 0,
		interval: ProductItemInterval.Month,
		priceInterval: ProductItemInterval.Year,
	});

const expectedVolumeAmount = ({
	quantity,
	tier2Amount = ANNUAL_TIER_2_AMOUNT,
}: {
	quantity: number;
	tier2Amount?: number;
}) => {
	const amount = quantity <= TIER_1_LIMIT ? ANNUAL_TIER_1_AMOUNT : tier2Amount;
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
	`${chalk.yellowBright("separate intervals: attach annual prepaid volume + monthly overage invoices")}`,
	async () => {
		const customerId = "sep-int-annual-volume-attach";
		const plan = products.base({
			id: "sep-int-annual-volume",
			items: [
				annualVolumePrepaidMessages(),
				items.consumableMessages({
					includedUsage: 0,
					price: CONSUMABLE_UNIT_AMOUNT,
				}),
			],
		});
		const expectedImmediateTotal = expectedVolumeAmount({
			quantity: PREPAID_QUANTITY,
		});
		const expectedRenewalTotal = expectedOverageAmount({
			usage: OVERAGE_USAGE,
		});

		const { autumnV1, autumnV2_2, ctx, testClockId, advancedTo } =
			await initScenario({
				customerId,
				setup: [
					s.customer({ testClock: true, paymentMethod: "success" }),
					s.products({ list: [plan] }),
				],
				actions: [],
			});
		if (!testClockId)
			throw new Error("Expected test clock for renewal invoice");

		const attachParams: AttachParamsV1Input = {
			customer_id: customerId,
			plan_id: plan.id,
			feature_quantities: [
				{ feature_id: TestFeature.Messages, quantity: PREPAID_QUANTITY },
			],
			redirect_mode: "if_required",
		};
		const preview = await autumnV2_2.billing.previewAttach(attachParams);
		expect(preview.total).toBe(expectedImmediateTotal);
		await autumnV2_2.billing.attach<AttachParamsV1Input>(attachParams);

		let customerV3 = await autumnV1.customers.get<ApiCustomerV3>(customerId);
		await expectCustomerInvoiceCorrect({
			customer: customerV3,
			count: 1,
			latestTotal: expectedImmediateTotal,
		});
		await expectSeparateMessageEntitlements({
			ctx,
			customerId,
			productId: plan.id,
		});

		await autumnV2_2.track(
			{
				customer_id: customerId,
				feature_id: TestFeature.Messages,
				value: TRACKED_USAGE,
			},
			{
				timeout: 2000,
			},
		);
		const customerV5 =
			await autumnV2_2.customers.get<ApiCustomerV5>(customerId);
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

		customerV3 = await autumnV1.customers.get<ApiCustomerV3>(customerId);
		await expectCustomerInvoiceCorrect({
			customer: customerV3,
			count: 2,
			latestTotal: expectedRenewalTotal,
		});
		await expectSeparateMessageEntitlements({
			ctx,
			customerId,
			productId: plan.id,
		});
		expectBalanceCorrect({
			customer: await autumnV2_2.customers.get<ApiCustomerV5>(customerId),
			featureId: TestFeature.Messages,
			remaining: PREPAID_QUANTITY,
			usage: 0,
			planId: plan.id,
		});
	},
);

test.concurrent(
	`${chalk.yellowBright("separate intervals: pro to premium immediate switch renews with overage only")}`,
	async () => {
		const customerId = "sep-int-annual-volume-switch";
		const group = "sep-int-annual-volume-switch-group";
		const pro = products.base({
			id: "sep-int-pro",
			group,
			items: [
				annualVolumePrepaidMessages(),
				items.consumableMessages({
					includedUsage: 0,
					price: CONSUMABLE_UNIT_AMOUNT,
				}),
			],
		});
		const premium = products.base({
			id: "sep-int-premium",
			group,
			items: [
				annualVolumePrepaidMessages({
					tier2Amount: PREMIUM_ANNUAL_TIER_2_AMOUNT,
				}),
				items.consumableMessages({
					includedUsage: 0,
					price: CONSUMABLE_UNIT_AMOUNT,
				}),
			],
		});
		const expectedInitialTotal = expectedVolumeAmount({
			quantity: PREPAID_QUANTITY,
		});
		const expectedSwitchTotal =
			expectedVolumeAmount({
				quantity: PREPAID_QUANTITY,
				tier2Amount: PREMIUM_ANNUAL_TIER_2_AMOUNT,
			}) - expectedInitialTotal;
		const expectedRenewalTotal = expectedOverageAmount({
			usage: OVERAGE_USAGE,
		});

		const { autumnV1, autumnV2_2, ctx, testClockId, advancedTo } =
			await initScenario({
				customerId,
				setup: [
					s.customer({ testClock: true, paymentMethod: "success" }),
					s.products({ list: [pro, premium] }),
				],
				actions: [],
			});
		if (!testClockId)
			throw new Error("Expected test clock for renewal invoice");

		await autumnV2_2.billing.attach<AttachParamsV1Input>({
			customer_id: customerId,
			plan_id: pro.id,
			feature_quantities: [
				{ feature_id: TestFeature.Messages, quantity: PREPAID_QUANTITY },
			],
			redirect_mode: "if_required",
		});
		await expectCustomerInvoiceCorrect({
			customerId,
			count: 1,
			latestTotal: expectedInitialTotal,
		});

		const attachParams: AttachParamsV1Input = {
			customer_id: customerId,
			plan_id: premium.id,
			plan_schedule: "immediate",
			feature_quantities: [
				{ feature_id: TestFeature.Messages, quantity: PREPAID_QUANTITY },
			],
			redirect_mode: "if_required",
		};
		const preview = await autumnV2_2.billing.previewAttach(attachParams);
		expect(preview.total).toBe(expectedSwitchTotal);
		await autumnV2_2.billing.attach<AttachParamsV1Input>(attachParams);

		let customerV3 = await autumnV1.customers.get<ApiCustomerV3>(customerId);
		await expectCustomerInvoiceCorrect({
			customer: customerV3,
			count: 2,
			latestTotal: expectedSwitchTotal,
		});
		await expectCustomerProducts({
			customer: await autumnV2_2.customers.get<ApiCustomerV5>(customerId),
			active: [premium.id],
			notPresent: [pro.id],
		});
		await expectSeparateMessageEntitlements({
			ctx,
			customerId,
			productId: premium.id,
		});

		await autumnV2_2.track(
			{
				customer_id: customerId,
				feature_id: TestFeature.Messages,
				value: TRACKED_USAGE,
			},
			{
				timeout: 2000,
			},
		);
		await advanceToNextInvoice({
			stripeCli: ctx.stripeCli,
			testClockId,
			currentEpochMs: advancedTo,
			withPause: true,
		});

		customerV3 = await autumnV1.customers.get<ApiCustomerV3>(customerId);
		await expectCustomerInvoiceCorrect({
			customer: customerV3,
			count: 3,
			latestTotal: expectedRenewalTotal,
		});
		await expectSeparateMessageEntitlements({
			ctx,
			customerId,
			productId: premium.id,
		});
		expectBalanceCorrect({
			customer: await autumnV2_2.customers.get<ApiCustomerV5>(customerId),
			featureId: TestFeature.Messages,
			remaining: PREPAID_QUANTITY,
			usage: 0,
			planId: premium.id,
		});
	},
);
