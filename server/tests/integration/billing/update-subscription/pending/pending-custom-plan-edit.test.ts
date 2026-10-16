/**
 * Editing a custom pending (unpaid) plan.
 *
 * Red (before): the re-attach started from the catalog plan, so an edit that
 * didn't restate the price dropped the custom $1,200 back to the catalog $20.
 * Green (after): the edit lands on top of the pending plan's own price and items,
 * as billing.update does for an active plan, so an allowance-only edit keeps the
 * original payment.
 *
 * Red (before): paying after an allowance-only edit failed the checkout webhook with a
 * duplicate customer product, so the customer paid and never got the plan.
 * Green (after): paying grants the edited plan.
 */

import { expect, test } from "bun:test";
import {
	type ApiCustomerV3,
	type AttachParamsV1Input,
	CusProductStatus,
	customers,
	EntitlementDuration,
	type UpdateSubscriptionV1ParamsInput,
} from "@autumn/shared";
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

/** Attaches a $1,200 custom plan through Stripe checkout, leaving it pending. */
const setupCustomPendingPlan = async ({ name }: { name: string }) => {
	const customerId = `${name}-${Date.now()}`;
	const pro = products.pro({
		id: `pro-${name}`,
		items: [items.monthlyMessages({ includedUsage: 100 })],
	});

	const scenario = await initScenario({
		customerId,
		setup: [s.customer({ testClock: false }), s.products({ list: [pro] })],
		actions: [],
	});

	const attachResult =
		await scenario.autumnV2_2.billing.attach<AttachParamsV1Input>({
			customer_id: customerId,
			plan_id: pro.id,
			customize: {
				price: itemsV2.monthlyPrice({ amount: 1200 }),
				items: [itemsV2.monthlyMessages({ included: 100 })],
			},
		});

	const listPendingRows = async () => {
		const dbCustomer = await scenario.ctx.db.query.customers.findFirst({
			where: eq(customers.id, customerId),
		});
		return CusProductService.list({
			db: scenario.ctx.db,
			internalCustomerId: dbCustomer!.internal_id,
			inStatuses: [CusProductStatus.Pending],
		});
	};

	return {
		...scenario,
		customerId,
		pro,
		paymentUrl: attachResult.payment_url as string,
		listPendingRows,
	};
};

test.concurrent(
	`${chalk.yellowBright("pending custom plan edit: replacing the items keeps the custom price and the original payment")}`,
	async () => {
		const { autumnV2_2, customerId, pro, listPendingRows } =
			await setupCustomPendingPlan({ name: "pending-custom-items-edit" });
		const [originalRow] = await listPendingRows();

		const updateParams: UpdateSubscriptionV1ParamsInput = {
			customer_id: customerId,
			plan_id: pro.id,
			customize: { items: [itemsV2.monthlyMessages({ included: 200 })] },
		};

		// Only the allowance changes, so nothing new is due and the $1,200 checkout stands.
		const preview =
			await autumnV2_2.subscriptions.previewUpdate<UpdateSubscriptionV1ParamsInput>(
				updateParams,
			);
		expect(preview.total).toBe(0);

		await autumnV2_2.subscriptions.update<UpdateSubscriptionV1ParamsInput>(
			updateParams,
		);

		const pendingRows = await listPendingRows();
		expect(pendingRows).toHaveLength(1);
		const [pendingRow] = pendingRows;
		expect(pendingRow.metadata_id).toBe(originalRow.metadata_id);
		expect(
			pendingRow.customer_prices.map(
				(customerPrice) =>
					(customerPrice.price.config as { amount?: number }).amount,
			),
		).toEqual([1200]);
		expect(
			pendingRow.customer_entitlements.map(
				(customerEntitlement) => customerEntitlement.entitlement.allowance,
			),
		).toEqual([200]);
	},
);

test.concurrent(
	`${chalk.yellowBright("pending custom plan edit: add_items keeps the custom price and existing items")}`,
	async () => {
		const { autumnV2_2, customerId, pro, listPendingRows } =
			await setupCustomPendingPlan({ name: "pending-custom-add-items" });

		await autumnV2_2.subscriptions.update<UpdateSubscriptionV1ParamsInput>({
			customer_id: customerId,
			plan_id: pro.id,
			customize: { add_items: [itemsV2.dashboard()] },
		});

		const [pendingRow] = await listPendingRows();
		const featureIds = pendingRow.customer_entitlements.map(
			(customerEntitlement) => customerEntitlement.entitlement.feature_id,
		);
		expect(featureIds.sort()).toEqual(
			[TestFeature.Dashboard, TestFeature.Messages].sort(),
		);
		expect(
			pendingRow.customer_prices.map(
				(customerPrice) =>
					(customerPrice.price.config as { amount?: number }).amount,
			),
		).toEqual([1200]);
	},
);

test.concurrent(
	`${chalk.yellowBright("pending custom plan edit: a price-only edit keeps expiring one-off credits")}`,
	async () => {
		const customerId = `pending-custom-expiry-${Date.now()}`;
		const pro = products.pro({
			id: "pro-pending-custom-expiry",
			items: [items.monthlyMessages({ includedUsage: 100 })],
		});

		const { autumnV2_2, ctx } = await initScenario({
			customerId,
			setup: [s.customer({ testClock: false }), s.products({ list: [pro] })],
			actions: [],
		});

		await autumnV2_2.billing.attach<AttachParamsV1Input>({
			customer_id: customerId,
			plan_id: pro.id,
			feature_quantities: [{ feature_id: TestFeature.Messages, quantity: 100 }],
			customize: {
				price: itemsV2.monthlyPrice({ amount: 1200 }),
				items: [
					{
						...itemsV2.oneOffPrepaidMessages(),
						expiry: { duration: EntitlementDuration.Month, length: 1 },
					},
				],
			},
		});

		await autumnV2_2.subscriptions.update<UpdateSubscriptionV1ParamsInput>({
			customer_id: customerId,
			plan_id: pro.id,
			customize: { price: itemsV2.monthlyPrice({ amount: 1000 }) },
		});

		const dbCustomer = await ctx.db.query.customers.findFirst({
			where: eq(customers.id, customerId),
		});
		const [pendingRow] = await CusProductService.list({
			db: ctx.db,
			internalCustomerId: dbCustomer!.internal_id,
			inStatuses: [CusProductStatus.Pending],
		});
		const [messages] = pendingRow.customer_entitlements.map(
			(customerEntitlement) => customerEntitlement.entitlement,
		);
		expect(messages.expiry_duration).toBe(EntitlementDuration.Month);
		expect(messages.expiry_length).toBe(1);
	},
);

test.concurrent(
	`${chalk.yellowBright("pending custom plan edit: paying after an allowance-only edit grants the edited plan")}`,
	async () => {
		const {
			autumnV1,
			autumnV2_2,
			ctx,
			customerId,
			pro,
			paymentUrl,
			listPendingRows,
		} = await setupCustomPendingPlan({ name: "pending-custom-items-paid" });

		await autumnV2_2.subscriptions.update<UpdateSubscriptionV1ParamsInput>({
			customer_id: customerId,
			plan_id: pro.id,
			customize: { items: [itemsV2.monthlyMessages({ included: 200 })] },
		});

		await completeStripeCheckoutForm({ url: paymentUrl });
		await waitForStripeWebhook({
			stripeCli: ctx.stripeCli,
			env: ctx.env,
			types: ["checkout.session.completed"],
			objectId: paymentUrl.match(/cs_(test|live)_[A-Za-z0-9]+/)![0],
			until: async () => (await listPendingRows()).length === 0,
		});

		const customer = await autumnV1.customers.get<ApiCustomerV3>(customerId);
		expect(customer.products.find((p) => p.id === pro.id)?.status).toBe(
			"active",
		);
		expect(customer.features?.[TestFeature.Messages]?.included_usage).toBe(200);
	},
);

test.concurrent(
	`${chalk.yellowBright("pending custom plan edit: a price edit replaces the Stripe checkout with a new one")}`,
	async () => {
		const { autumnV2_2, customerId, pro, paymentUrl, listPendingRows } =
			await setupCustomPendingPlan({ name: "pending-custom-price-link" });

		const updateResult =
			await autumnV2_2.subscriptions.update<UpdateSubscriptionV1ParamsInput>({
				customer_id: customerId,
				plan_id: pro.id,
				customize: { price: itemsV2.monthlyPrice({ amount: 1000 }) },
			});

		expect(updateResult.payment_url).toContain("checkout.stripe.com");
		expect(updateResult.payment_url).not.toBe(paymentUrl);
		expect(await listPendingRows()).toHaveLength(1);
	},
);
