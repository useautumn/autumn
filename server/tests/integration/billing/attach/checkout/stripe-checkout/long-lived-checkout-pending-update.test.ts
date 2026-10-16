/**
 * Editing a pending plan opened from a long-lived checkout link.
 *
 * Contract:
 * - A billing edit returns the same link, which then sells the edited plan, with
 *   exactly one pending plan left.
 * - The preview and the charge both keep the link's discounts.
 * - An edit that needs no payment attaches directly and closes the link.
 * - An expired link is not reused; the edit falls back to a fresh checkout.
 * - An allowance-only edit keeps the link's payment, and paying it grants the edited plan.
 * - A free-trial edit keeps the link, which then sells the trial.
 */

import { expect, test } from "bun:test";
import {
	type ApiCustomerV3,
	type AttachParamsV1Input,
	CusProductStatus,
	checkouts,
	customers,
	type DeferredAutumnBillingPlanData,
	FreeTrialDuration,
	metadata,
	type UpdateSubscriptionV1ParamsInput,
} from "@autumn/shared";
import { createPercentCoupon } from "@tests/integration/billing/utils/discounts/discountTestUtils";
import { TestFeature } from "@tests/setup/v2Features";
import { completeStripeCheckoutFormV2 as completeStripeCheckoutForm } from "@tests/utils/browserPool/completeStripeCheckoutFormV2";
import { items } from "@tests/utils/fixtures/items";
import { itemsV2 } from "@tests/utils/fixtures/itemsV2";
import { products } from "@tests/utils/fixtures/products";
import { waitForStripeWebhook } from "@tests/utils/stripeUtils/waitForStripeWebhook";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario";
import chalk from "chalk";
import { eq } from "drizzle-orm";
import { CusProductService } from "@/internal/customers/cusProducts/CusProductService";
import {
	getLongLivedCheckoutId,
	getStripeSessionId,
	requestLongLivedCheckoutStart,
	startLongLivedCheckout,
} from "./utils/longLivedCheckoutUtils";

/** Sends a $1,200 long-lived link and opens it, leaving one pending plan. */
const setupOpenedLongLivedLink = async ({
	name,
	discountPercentOff,
}: {
	name: string;
	discountPercentOff?: number;
}) => {
	const customerId = `${name}-${Date.now()}`;
	const pro = products.pro({
		id: `pro-${name}`,
		items: [items.monthlyMessages({ includedUsage: 100 })],
	});

	const scenario = await initScenario({
		customerId,
		setup: [s.customer({ testClock: true }), s.products({ list: [pro] })],
		actions: [],
	});
	const { autumnV2_2, ctx } = scenario;

	const coupon = discountPercentOff
		? await createPercentCoupon({
				stripeCli: ctx.stripeCli,
				percentOff: discountPercentOff,
			})
		: undefined;

	const attachResult = await autumnV2_2.billing.attach<AttachParamsV1Input>({
		customer_id: customerId,
		plan_id: pro.id,
		long_lived_checkout: true,
		customize: { price: itemsV2.monthlyPrice({ amount: 1200 }) },
		discounts: coupon ? [{ reward_id: coupon.id }] : undefined,
	});
	const checkoutId = getLongLivedCheckoutId(attachResult.payment_url);
	const firstSessionId = getStripeSessionId(
		await startLongLivedCheckout(checkoutId),
	);

	const listCustomerProducts = async (status: CusProductStatus) => {
		const dbCustomer = await ctx.db.query.customers.findFirst({
			where: eq(customers.id, customerId),
		});
		return CusProductService.list({
			db: ctx.db,
			internalCustomerId: dbCustomer!.internal_id,
			inStatuses: [status],
		});
	};

	return {
		...scenario,
		customerId,
		pro,
		linkUrl: attachResult.payment_url,
		checkoutId,
		firstSessionId,
		listCustomerProducts,
	};
};

test.concurrent(
	`${chalk.yellowBright("long-lived checkout pending update: editing the price keeps the link and sells the edited plan")}`,
	async () => {
		const {
			autumnV2_2,
			ctx,
			customerId,
			pro,
			linkUrl,
			checkoutId,
			firstSessionId,
			listCustomerProducts,
		} = await setupOpenedLongLivedLink({ name: "ll-pending-update-price" });

		// 1. The edit returns the same link instead of a new Stripe URL.
		const updateResult =
			await autumnV2_2.subscriptions.update<UpdateSubscriptionV1ParamsInput>({
				customer_id: customerId,
				plan_id: pro.id,
				customize: { price: itemsV2.monthlyPrice({ amount: 1000 }) },
			});
		expect(updateResult.payment_url).toBe(linkUrl);

		// 2. Opening the link sells the edited plan in a new Stripe session.
		const editedSessionId = getStripeSessionId(
			await startLongLivedCheckout(checkoutId),
		);
		expect(editedSessionId).not.toBe(firstSessionId);
		const editedSession =
			await ctx.stripeCli.checkout.sessions.retrieve(editedSessionId);
		expect(editedSession.amount_total).toBe(100_000);

		// 3. The customer still has exactly one pending plan.
		expect(await listCustomerProducts(CusProductStatus.Pending)).toHaveLength(
			1,
		);
	},
);

test.concurrent(
	`${chalk.yellowBright("long-lived checkout pending update: the preview and the charge keep the link's discount")}`,
	async () => {
		const { autumnV2_2, ctx, customerId, pro, checkoutId } =
			await setupOpenedLongLivedLink({
				name: "ll-pending-update-discount",
				discountPercentOff: 50,
			});

		const updateParams: UpdateSubscriptionV1ParamsInput = {
			customer_id: customerId,
			plan_id: pro.id,
			customize: { price: itemsV2.monthlyPrice({ amount: 1000 }) },
		};

		const preview =
			await autumnV2_2.subscriptions.previewUpdate<UpdateSubscriptionV1ParamsInput>(
				updateParams,
			);
		expect(preview.total).toBe(500);

		await autumnV2_2.subscriptions.update<UpdateSubscriptionV1ParamsInput>(
			updateParams,
		);
		const editedSession = await ctx.stripeCli.checkout.sessions.retrieve(
			getStripeSessionId(await startLongLivedCheckout(checkoutId)),
		);
		expect(editedSession.amount_total).toBe(50_000);
	},
);

test.concurrent(
	`${chalk.yellowBright("long-lived checkout pending update: an edit that needs no payment attaches directly and closes the link")}`,
	async () => {
		const { autumnV2_2, customerId, pro, checkoutId, listCustomerProducts } =
			await setupOpenedLongLivedLink({ name: "ll-pending-update-free" });

		const updateResult =
			await autumnV2_2.subscriptions.update<UpdateSubscriptionV1ParamsInput>({
				customer_id: customerId,
				plan_id: pro.id,
				customize: { price: null },
			});
		expect(updateResult.payment_url).toBeNull();

		const activeRows = await listCustomerProducts(CusProductStatus.Active);
		expect(activeRows.some((row) => row.product.id === pro.id)).toBe(true);

		const reopen = await requestLongLivedCheckoutStart(checkoutId);
		expect(reopen.status).toBe(409);
		expect((await reopen.json()).code).toBe("checkout_completed");
	},
);

test.concurrent(
	`${chalk.yellowBright("long-lived checkout pending update: an expired link is not reused")}`,
	async () => {
		const { autumnV2_2, ctx, customerId, pro, checkoutId } =
			await setupOpenedLongLivedLink({ name: "ll-pending-update-expired" });

		await ctx.db
			.update(checkouts)
			.set({ expires_at: Date.now() - 1000 })
			.where(eq(checkouts.id, checkoutId));

		const updateResult =
			await autumnV2_2.subscriptions.update<UpdateSubscriptionV1ParamsInput>({
				customer_id: customerId,
				plan_id: pro.id,
				customize: { price: itemsV2.monthlyPrice({ amount: 1000 }) },
			});
		expect(updateResult.payment_url).toContain("checkout.stripe.com");
	},
);

test.concurrent(
	`${chalk.yellowBright("long-lived checkout pending update: paying after an allowance-only edit grants the edited plan")}`,
	async () => {
		const {
			autumnV1,
			autumnV2_2,
			ctx,
			customerId,
			pro,
			checkoutId,
			listCustomerProducts,
		} = await setupOpenedLongLivedLink({
			name: "ll-pending-update-allowance-paid",
		});

		await autumnV2_2.subscriptions.update<UpdateSubscriptionV1ParamsInput>({
			customer_id: customerId,
			plan_id: pro.id,
			customize: { items: [itemsV2.monthlyMessages({ included: 500 })] },
		});

		// Nothing new is due, so the link still sells $1,200; paying it grants the edited plan.
		const stripeUrl = await startLongLivedCheckout(checkoutId);
		const session = await ctx.stripeCli.checkout.sessions.retrieve(
			getStripeSessionId(stripeUrl),
		);
		expect(session.amount_total).toBe(120_000);

		await completeStripeCheckoutForm({ url: stripeUrl });
		await waitForStripeWebhook({
			stripeCli: ctx.stripeCli,
			env: ctx.env,
			types: ["checkout.session.completed"],
			objectId: session.id,
			until: async () =>
				(await listCustomerProducts(CusProductStatus.Active)).length === 1,
		});

		const customer = await autumnV1.customers.get<ApiCustomerV3>(customerId);
		expect(customer.features?.[TestFeature.Messages]?.included_usage).toBe(500);
		expect(await listCustomerProducts(CusProductStatus.Pending)).toHaveLength(
			0,
		);
	},
);

test.concurrent(
	`${chalk.yellowBright("long-lived checkout pending update: a free-trial edit keeps the link and the link sells the trial")}`,
	async () => {
		const {
			autumnV2_2,
			ctx,
			customerId,
			pro,
			linkUrl,
			checkoutId,
			listCustomerProducts,
		} = await setupOpenedLongLivedLink({ name: "ll-pending-update-trial" });

		const updateResult =
			await autumnV2_2.subscriptions.update<UpdateSubscriptionV1ParamsInput>({
				customer_id: customerId,
				plan_id: pro.id,
				customize: {
					free_trial: {
						duration_length: 7,
						duration_type: FreeTrialDuration.Day,
						card_required: true,
					},
				},
			});
		expect(updateResult.payment_url).toBe(linkUrl);

		const sessionId = getStripeSessionId(
			await startLongLivedCheckout(checkoutId),
		);
		const sessionMetadata = await ctx.db.query.metadata.findFirst({
			where: eq(metadata.stripe_checkout_session_id, sessionId),
		});
		const { billingPlan } = sessionMetadata!
			.data as DeferredAutumnBillingPlanData;
		expect(
			billingPlan.stripe.checkoutSessionAction?.params.subscription_data
				?.trial_end,
		).toBeDefined();
		expect(await listCustomerProducts(CusProductStatus.Pending)).toHaveLength(
			1,
		);
	},
);

test.concurrent(
	`${chalk.yellowBright("long-lived checkout pending update: switching the edit to an invoice bills it and closes the link")}`,
	async () => {
		const {
			autumnV2_2,
			ctx,
			customerId,
			pro,
			checkoutId,
			listCustomerProducts,
		} = await setupOpenedLongLivedLink({ name: "ll-pending-update-invoice" });

		await autumnV2_2.subscriptions.update<UpdateSubscriptionV1ParamsInput>({
			customer_id: customerId,
			plan_id: pro.id,
			customize: { price: itemsV2.monthlyPrice({ amount: 1000 }) },
			invoice_mode: { enabled: true, enable_plan_immediately: true },
		});

		expect(await listCustomerProducts(CusProductStatus.Active)).toHaveLength(1);
		expect(await listCustomerProducts(CusProductStatus.Pending)).toHaveLength(
			0,
		);

		const dbCustomer = await ctx.db.query.customers.findFirst({
			where: eq(customers.id, customerId),
		});
		const invoices = await ctx.stripeCli.invoices.list({
			customer: dbCustomer!.processor!.id,
		});
		expect(invoices.data.map((invoice) => invoice.total)).toEqual([100_000]);

		const reopen = await requestLongLivedCheckoutStart(checkoutId);
		expect(reopen.status).toBe(409);
	},
);
