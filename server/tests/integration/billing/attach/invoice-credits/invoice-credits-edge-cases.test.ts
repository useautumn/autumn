/**
 * Invoice credits (price-derived, 1:1) across the paths the stamp has to
 * survive: the legacy attach builder, entity-scoped balances, a free trial,
 * a customer billed in a non-default currency, and a mid-cycle switch to a
 * plan whose price no longer qualifies.
 *
 * Contract:
 *   E1 legacy attach, $1/credit        → stamp true, renewal invoice itemized
 *   E2 entity-scoped $1/credit, 2 ents → stamp true; each entity itemizes on its own, and an entity
 *                                        whose usage stayed within its included credits adds no lines
 *   E3 7-day trial, $1/credit          → stamp true; usage during the trial is not charged at trial end
 *   E4 eur customer, €1/credit         → stamp true, eur invoice itemized at €1 per credit
 *   E5 switch $1/credit → $0.10/credit → old balance stays stamped, new balance stamped false,
 *                                        switch invoice itemizes the old balance's usage
 *
 * E5 settles the tracks before switching: the switch bills from Postgres, and
 * track deducts in Redis first, so a switch within the lazy-sync window reads
 * the pre-usage balance and bills no overage. A Stripe meter would still bill a
 * plain consumable in that window; an itemized balance has no meter.
 */

import { expect, test } from "bun:test";
import {
	type ApiCustomerV3,
	type ApiCustomerV5,
	ApiVersion,
	BillingInterval,
	BillingMethod,
	customerEntitlements,
} from "@autumn/shared";
import { expectCustomerInvoiceCorrect } from "@tests/integration/billing/utils/expectCustomerInvoiceCorrect";
import {
	expectInvoiceLineItemsCorrect,
	waitForInvoiceLineItems,
} from "@tests/integration/billing/utils/expectInvoiceLineItemsCorrect";
import { TestFeature } from "@tests/setup/v2Features";
import { items } from "@tests/utils/fixtures/items";
import { products } from "@tests/utils/fixtures/products";
import { timeout } from "@tests/utils/genUtils.js";
import { advanceToNextInvoice } from "@tests/utils/testAttachUtils/testAttachUtils";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario";
import chalk from "chalk";
import { eq } from "drizzle-orm";
import { AutumnRpcCli } from "@/external/autumn/autumnRpcCli.js";

const INCLUDED = 100;
const USAGE = 250;
const ACTION1_CREDITS = USAGE * 0.2;
const ACTION2_CREDITS = USAGE * 0.6;
const BASE_PRICE = 20;

type Scenario = Awaited<ReturnType<typeof initScenario>>;

const creditRows = async ({
	ctx,
	customerId,
}: {
	ctx: Scenario["ctx"];
	customerId: string;
}) =>
	(
		await ctx.db
			.select()
			.from(customerEntitlements)
			.where(eq(customerEntitlements.customer_id, customerId))
	).filter((row) => row.feature_id === TestFeature.InvoiceCredits);

const oneToOneCredits = ({
	entityFeatureId,
}: {
	entityFeatureId?: string;
} = {}) =>
	items.consumable({
		featureId: TestFeature.InvoiceCredits,
		includedUsage: INCLUDED,
		price: 1,
		entityFeatureId,
	});

const itemizedLines = ({
	action1Amount,
	action2Amount,
	creditsApplied,
}: {
	action1Amount: number;
	action2Amount: number;
	creditsApplied: number;
}) => [
	{
		featureId: TestFeature.Action1,
		direction: "charge" as const,
		billingTiming: "in_arrear" as const,
		amount: action1Amount,
	},
	{
		featureId: TestFeature.Action2,
		direction: "charge" as const,
		billingTiming: "in_arrear" as const,
		amount: action2Amount,
	},
	{
		featureId: TestFeature.InvoiceCredits,
		direction: "refund" as const,
		billingTiming: "in_arrear" as const,
		amount: -creditsApplied,
	},
];

test.concurrent(
	`${chalk.yellowBright("invoice credits E1: the legacy attach path stamps and itemizes")}`,
	async () => {
		const customerId = "ic-edge-legacy";
		const plan = products.pro({
			id: "ic-edge-legacy-plan",
			items: [oneToOneCredits()],
		});

		const { autumnV2_3, ctx } = await initScenario({
			customerId,
			setup: [
				s.customer({ paymentMethod: "success" }),
				s.products({ list: [plan] }),
			],
			actions: [
				s.attach({ productId: plan.id }),
				s.track({ featureId: TestFeature.Action1, value: USAGE }),
				s.track({ featureId: TestFeature.Action2, value: USAGE }),
				s.advanceToNextInvoice({ withPause: true }),
			],
		});

		const [row] = await creditRows({ ctx, customerId });
		expect(row?.invoice_credit).toBe(true);

		const customer = await autumnV2_3.customers.get<ApiCustomerV5>(customerId);
		const overage = ACTION1_CREDITS + ACTION2_CREDITS - INCLUDED;
		await expectInvoiceLineItemsCorrect({
			stripeInvoiceId: customer.invoices![0]!.stripe_id,
			expectedCount: 4,
			expectedTotal: BASE_PRICE + overage,
			expectedLineItems: [
				{ isBasePrice: true, direction: "charge", amount: BASE_PRICE },
				...itemizedLines({
					action1Amount: ACTION1_CREDITS,
					action2Amount: ACTION2_CREDITS,
					creditsApplied: INCLUDED,
				}),
			],
		});
	},
	{ timeout: 240_000 },
);

test.concurrent(
	`${chalk.yellowBright("invoice credits E2: entity-scoped balances keep one ledger each and the invoice sums them")}`,
	async () => {
		const customerId = "ic-edge-entities";
		const plan = products.pro({
			id: "ic-edge-entities-plan",
			items: [oneToOneCredits({ entityFeatureId: TestFeature.Users })],
		});

		// entity 0 spends 50 credits (within its 100), entity 1 spends 150 (50 over).
		const { autumnV2_3, ctx } = await initScenario({
			customerId,
			setup: [
				s.customer({ paymentMethod: "success" }),
				s.products({ list: [plan] }),
				s.entities({ count: 2, featureId: TestFeature.Users }),
			],
			actions: [
				s.billing.attach({ productId: plan.id }),
				s.track({
					featureId: TestFeature.Action1,
					value: USAGE,
					entityIndex: 0,
				}),
				s.track({
					featureId: TestFeature.Action2,
					value: USAGE,
					entityIndex: 1,
				}),
				s.advanceToNextInvoice({ withPause: true }),
			],
		});

		const rows = await creditRows({ ctx, customerId });
		expect(rows.length).toBeGreaterThan(0);
		for (const row of rows) expect(row.invoice_credit).toBe(true);

		// Entity 1 overran its included credits and itemizes; entity 0 netted to zero and adds nothing.
		const entityOverage = ACTION2_CREDITS - INCLUDED;
		const customer = await autumnV2_3.customers.get<ApiCustomerV5>(customerId);
		await expectInvoiceLineItemsCorrect({
			stripeInvoiceId: customer.invoices![0]!.stripe_id,
			expectedCount: 3,
			expectedTotal: BASE_PRICE + entityOverage,
			expectedLineItems: [
				{ isBasePrice: true, direction: "charge", amount: BASE_PRICE },
				{
					featureId: TestFeature.Action2,
					direction: "charge",
					billingTiming: "in_arrear",
					amount: ACTION2_CREDITS,
				},
				{
					featureId: TestFeature.InvoiceCredits,
					direction: "refund",
					billingTiming: "in_arrear",
					amount: -INCLUDED,
				},
			],
		});
	},
	{ timeout: 240_000 },
);

test.concurrent(
	`${chalk.yellowBright("invoice credits E3: usage during a free trial is not charged when the trial converts")}`,
	async () => {
		const customerId = "ic-edge-trial";
		const plan = products.proWithTrial({
			id: "ic-edge-trial-plan",
			items: [oneToOneCredits()],
			trialDays: 7,
			cardRequired: true,
		});

		const { autumnV2_3, ctx } = await initScenario({
			customerId,
			setup: [
				s.customer({ paymentMethod: "success" }),
				s.products({ list: [plan] }),
			],
			actions: [
				s.billing.attach({ productId: plan.id }),
				s.track({ featureId: TestFeature.Action1, value: USAGE }),
				s.track({ featureId: TestFeature.Action2, value: USAGE }),
				s.advanceToNextInvoice({ withPause: true }),
			],
		});

		const [row] = await creditRows({ ctx, customerId });
		expect(row?.invoice_credit).toBe(true);

		const customer = await autumnV2_3.customers.get<ApiCustomerV5>(customerId);
		const firstPaidInvoice = customer.invoices![0]!;
		expect(firstPaidInvoice.total).toBe(BASE_PRICE);
		const lineItems = await waitForInvoiceLineItems({
			stripeInvoiceId: firstPaidInvoice.stripe_id,
		});
		expect(
			lineItems.filter((line) =>
				[TestFeature.Action1, TestFeature.Action2].includes(
					line.feature_id as TestFeature,
				),
			),
		).toEqual([]);
		expect(customer.balances[TestFeature.InvoiceCredits]?.remaining).toBe(
			INCLUDED,
		);
	},
	{ timeout: 240_000 },
);

test.concurrent(
	`${chalk.yellowBright("invoice credits E4: a eur customer is itemized at the eur rate")}`,
	async () => {
		const customerId = "ic-edge-eur";
		const planId = `ic-edge-eur-plan-${Math.random().toString(36).slice(2, 8)}`;
		const rpc = new AutumnRpcCli({ version: ApiVersion.V2_1 });
		const eurBase = 18;
		await rpc.plans.create({
			plan_id: planId,
			name: "IC Edge EUR",
			auto_enable: false,
			price: {
				amount: BASE_PRICE,
				interval: BillingInterval.Month,
				additional_currencies: [{ currency: "eur", amount: eurBase }],
			},
			items: [
				{
					feature_id: TestFeature.InvoiceCredits,
					included: INCLUDED,
					price: {
						amount: 1,
						interval: BillingInterval.Month,
						billing_method: BillingMethod.UsageBased,
						billing_units: 1,
						additional_currencies: [{ currency: "eur", amount: 1 }],
					},
				},
			],
		});

		const { autumnV1, autumnV2_3, ctx, testClockId } = await initScenario({
			customerId,
			setup: [
				s.customer({
					paymentMethod: "success",
					data: { currency: "eur" },
				}),
			],
			actions: [],
		});

		// The plan was created outside the fixtures, so attach and advance by hand.
		await autumnV1.billing.attach({
			customer_id: customerId,
			product_id: planId,
			redirect_mode: "if_required",
		});
		await autumnV2_3.track({
			customer_id: customerId,
			feature_id: TestFeature.Action1,
			value: USAGE,
		});
		await autumnV2_3.track({
			customer_id: customerId,
			feature_id: TestFeature.Action2,
			value: USAGE,
		});
		await timeout(3_000);
		await advanceToNextInvoice({
			stripeCli: ctx.stripeCli,
			testClockId: testClockId!,
			withPause: true,
		});
		await expectCustomerInvoiceCorrect({
			autumn: autumnV1,
			customerId,
			count: 2,
		});

		const [row] = await creditRows({ ctx, customerId });
		expect(row?.invoice_credit).toBe(true);

		const customer = await autumnV1.customers.get<ApiCustomerV3>(customerId);
		const renewal = customer.invoices![0]!;
		const stripeInvoice = await ctx.stripeCli.invoices.retrieve(
			renewal.stripe_id,
		);
		expect(stripeInvoice.currency).toBe("eur");

		const overage = ACTION1_CREDITS + ACTION2_CREDITS - INCLUDED;
		await expectInvoiceLineItemsCorrect({
			stripeInvoiceId: renewal.stripe_id,
			expectedCount: 4,
			expectedTotal: eurBase + overage,
			expectedLineItems: [
				{ isBasePrice: true, direction: "charge", amount: eurBase },
				...itemizedLines({
					action1Amount: ACTION1_CREDITS,
					action2Amount: ACTION2_CREDITS,
					creditsApplied: INCLUDED,
				}),
			],
		});
	},
	{ timeout: 240_000 },
);

test.concurrent(
	`${chalk.yellowBright("invoice credits E5: switching to a non-1:1 plan mid-cycle itemizes the old usage and stamps the new balance false")}`,
	async () => {
		const customerId = "ic-edge-switch";
		const oneToOne = products.pro({
			id: "ic-edge-switch-one-to-one",
			items: [oneToOneCredits()],
		});
		const fractional = products.premium({
			id: "ic-edge-switch-fractional",
			items: [
				items.consumable({
					featureId: TestFeature.InvoiceCredits,
					includedUsage: INCLUDED,
					price: 0.1,
				}),
			],
		});

		const { autumnV2_3, ctx } = await initScenario({
			customerId,
			setup: [
				s.customer({ paymentMethod: "success" }),
				s.products({ list: [oneToOne, fractional] }),
			],
			actions: [
				s.billing.attach({ productId: oneToOne.id }),
				s.track({ featureId: TestFeature.Action1, value: USAGE }),
				s.track({
					featureId: TestFeature.Action2,
					value: USAGE,
					timeout: 4_000,
				}),
				s.billing.attach({ productId: fractional.id }),
			],
		});

		const rows = await creditRows({ ctx, customerId });
		const stamps = rows.map((row) => row.invoice_credit).sort();
		expect(stamps).toEqual([false, true]);

		// Same clock instant as the first attach, so the old base refunds in full.
		const customer = await autumnV2_3.customers.get<ApiCustomerV5>(customerId);
		const overage = ACTION1_CREDITS + ACTION2_CREDITS - INCLUDED;
		const premiumBase = 50;
		await expectInvoiceLineItemsCorrect({
			stripeInvoiceId: customer.invoices![0]!.stripe_id,
			expectedCount: 5,
			expectedTotal: overage - BASE_PRICE + premiumBase,
			expectedLineItems: [
				{ isBasePrice: true, direction: "refund", amount: -BASE_PRICE },
				{ isBasePrice: true, direction: "charge", amount: premiumBase },
				...itemizedLines({
					action1Amount: ACTION1_CREDITS,
					action2Amount: ACTION2_CREDITS,
					creditsApplied: INCLUDED,
				}),
			],
		});
		expect(customer.balances[TestFeature.InvoiceCredits]?.remaining).toBe(
			INCLUDED,
		);
	},
	{ timeout: 240_000 },
);
