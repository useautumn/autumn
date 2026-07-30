import { expect, test } from "bun:test";
import type {
	ApiCustomerV3,
	AttachPreviewResponse,
	CreateScheduleParamsV0Input,
} from "@autumn/shared";
import {
	createAmountCoupon,
	createPercentCoupon,
} from "@tests/integration/billing/utils/discounts/discountTestUtils";
import { expectCustomerInvoiceCorrect } from "@tests/integration/billing/utils/expectCustomerInvoiceCorrect";
import { expectCustomerProducts } from "@tests/integration/billing/utils/expectCustomerProductCorrect";
import {
	expectInvoiceLineItemsCorrect,
	waitForInvoiceLineItems,
} from "@tests/integration/billing/utils/expectInvoiceLineItemsCorrect";
import { expectStripeSubscriptionCorrect } from "@tests/integration/billing/utils/expectStripeSubCorrect";
import {
	calculateProratedDiff,
	calculateProration,
} from "@tests/integration/billing/utils/proration";
import { items } from "@tests/utils/fixtures/items";
import { products } from "@tests/utils/fixtures/products";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario";
import chalk from "chalk";
import { ProductService } from "@/internal/products/ProductService";

const previewCreateSchedule = async ({
	autumnV1,
	params,
}: {
	autumnV1: Awaited<ReturnType<typeof initScenario>>["autumnV1"];
	params: CreateScheduleParamsV0Input;
}): Promise<AttachPreviewResponse> =>
	await autumnV1.post("/billing.preview_create_schedule", params);

const roundMoney = (amount: number) => Math.round(amount * 100) / 100;

test.concurrent(
	`${chalk.yellowBright("create-schedule immediate multi-plan: applies global and scoped coupons")}`,
	async () => {
		const planA = products.pro({
			id: "discount-plan-a",
			items: [items.monthlyMessages()],
		});
		const planB = products.base({
			id: "discount-plan-b",
			group: "discount-group-b",
			items: [items.monthlyWords(), items.monthlyPrice({ price: 30 })],
		});
		const { customerId, autumnV1, ctx } = await initScenario({
			customerId: "cs-immediate-discounts",
			setup: [
				s.customer({ paymentMethod: "success" }),
				s.products({ list: [planA, planB] }),
			],
			actions: [],
		});
		const fullPlanB = await ProductService.getFull({
			db: ctx.db,
			orgId: ctx.org.id,
			env: ctx.env,
			idOrInternalId: planB.id,
		});
		const globalCoupon = await createPercentCoupon({
			stripeCli: ctx.stripeCli,
			percentOff: 20,
		});
		const scopedCoupon = await createAmountCoupon({
			stripeCli: ctx.stripeCli,
			amountOffCents: 1000,
			appliesToProducts: [fullPlanB.processor!.id],
		});
		const params: CreateScheduleParamsV0Input = {
			customer_id: customerId,
			phases: [
				{
					starts_at: "now",
					plans: [{ plan_id: planA.id }, { plan_id: planB.id }],
				},
			],
			discounts: [
				{ reward_id: globalCoupon.id },
				{ reward_id: scopedCoupon.id },
			],
		};

		const preview = await previewCreateSchedule({ autumnV1, params });
		expect(preview.total).toBe(30);

		const result = await autumnV1.billing.createSchedule(params);
		const customer = await autumnV1.customers.get<ApiCustomerV3>(customerId);
		await expectCustomerProducts({
			customer,
			active: [planA.id, planB.id],
		});
		await expectCustomerInvoiceCorrect({ customer, count: 1, latestTotal: 30 });
		await waitForInvoiceLineItems({
			stripeInvoiceId: result.invoice!.stripe_id,
			timeoutMs: 60_000,
		});
		await expectInvoiceLineItemsCorrect({
			stripeInvoiceId: result.invoice!.stripe_id,
			expectedTotal: 50,
			allCharges: true,
			expectedLineItems: [
				{
					isBasePrice: true,
					productId: planA.id,
					amount: 20,
					discount: {
						amountAfterDiscounts: 16,
						discountAmountOff: 4,
						couponIds: [globalCoupon.id],
					},
				},
				{
					isBasePrice: true,
					productId: planB.id,
					amount: 30,
					discount: {
						amountAfterDiscounts: 14,
						discountAmountOff: 16,
						couponIds: [globalCoupon.id, scopedCoupon.id],
					},
				},
			],
		});
		await expectStripeSubscriptionCorrect({ ctx, customerId });
	},
);

test.concurrent(
	`${chalk.yellowBright("create-schedule immediate multi-plan: prorates every plan")}`,
	async () => {
		const pro = products.pro({
			id: "proration-pro",
			items: [items.monthlyMessages()],
		});
		const premium = products.premium({
			id: "proration-premium",
			items: [items.monthlyMessages()],
		});
		const addon = products.recurringAddOn({
			id: "proration-addon",
			items: [items.monthlyWords()],
		});
		const { customerId, autumnV1, ctx, advancedTo } = await initScenario({
			customerId: "cs-immediate-proration",
			setup: [
				s.customer({ paymentMethod: "success" }),
				s.products({ list: [pro, premium, addon] }),
			],
			actions: [
				s.billing.attach({ productId: pro.id }),
				s.advanceTestClock({ days: 15 }),
			],
		});
		const params: CreateScheduleParamsV0Input = {
			customer_id: customerId,
			preserve_add_ons: true,
			phases: [
				{
					starts_at: "now",
					plans: [{ plan_id: premium.id }, { plan_id: addon.id }],
				},
			],
		};
		const [upgrade, addonCharge, proCredit, premiumCharge] = await Promise.all([
			calculateProratedDiff({
				customerId,
				advancedTo,
				oldAmount: 20,
				newAmount: 50,
			}),
			calculateProration({ customerId, advancedTo, amount: 20 }),
			calculateProration({ customerId, advancedTo, amount: 20 }),
			calculateProration({ customerId, advancedTo, amount: 50 }),
		]);

		const preview = await previewCreateSchedule({ autumnV1, params });
		expect(preview.total).toBeCloseTo(upgrade + addonCharge, 0);
		expect(preview.incoming.map(({ plan_id }) => plan_id)).toEqual(
			expect.arrayContaining([premium.id, addon.id]),
		);

		const result = await autumnV1.billing.createSchedule(params);
		const customer = await autumnV1.customers.get<ApiCustomerV3>(customerId);
		await expectCustomerProducts({
			customer,
			active: [premium.id, addon.id],
			notPresent: [pro.id],
		});
		await expectCustomerInvoiceCorrect({
			customer,
			count: 2,
			latestTotal: preview.total,
		});
		await waitForInvoiceLineItems({
			stripeInvoiceId: result.invoice!.stripe_id,
			timeoutMs: 60_000,
		});
		await expectInvoiceLineItemsCorrect({
			stripeInvoiceId: result.invoice!.stripe_id,
			expectedTotal: roundMoney(premiumCharge + addonCharge - proCredit),
			expectedLineItems: [
				{
					isBasePrice: true,
					productId: pro.id,
					direction: "refund",
					amount: -roundMoney(proCredit),
				},
				{
					isBasePrice: true,
					productId: premium.id,
					direction: "charge",
					amount: roundMoney(premiumCharge),
				},
				{
					isBasePrice: true,
					productId: addon.id,
					direction: "charge",
					amount: roundMoney(addonCharge),
				},
			],
		});
		await expectStripeSubscriptionCorrect({ ctx, customerId });
	},
);
