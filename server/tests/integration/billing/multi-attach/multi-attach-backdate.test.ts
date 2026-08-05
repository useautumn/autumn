/**
 * Multi-attach accepts one shared past starts_at for new paid subscriptions.
 * It backdates every customer product, the Stripe subscription, and its invoice.
 */

import { expect, test } from "bun:test";
import {
	type ApiCustomerV3,
	type MultiAttachParamsV0Input,
	ms,
} from "@autumn/shared";
import { expectBackdatedStripeSubscriptionCorrect } from "@tests/integration/billing/utils/expectBackdatedStripeSubscriptionCorrect";
import { expectCustomerInvoiceCorrect } from "@tests/integration/billing/utils/expectCustomerInvoiceCorrect";
import { expectAutumnError } from "@tests/utils/expectUtils/expectErrUtils";
import { items } from "@tests/utils/fixtures/items";
import { products } from "@tests/utils/fixtures/products";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario";
import chalk from "chalk";
import { getCustomerProduct } from "../attach/params/start-date/utils";

test.concurrent(
	`${chalk.yellowBright("multi-attach backdate: shared starts_at backdates every plan")}`,
	async () => {
		const customerId = "multi-attach-backdate";
		const plan = products.pro({
			id: "plan",
			items: [items.monthlyMessages({ includedUsage: 100 })],
		});
		const addOn = products.recurringAddOn({
			id: "add-on",
			items: [items.monthlyUsers({ includedUsage: 5 })],
		});
		const { autumnV1, autumnV2_2, ctx, advancedTo } = await initScenario({
			customerId,
			setup: [
				s.customer({ paymentMethod: "success" }),
				s.products({ list: [plan, addOn] }),
			],
			actions: [],
		});
		const startsAt = advancedTo - ms.days(35);
		const params: MultiAttachParamsV0Input = {
			customer_id: customerId,
			plans: [{ plan_id: plan.id }, { plan_id: addOn.id }],
			starts_at: startsAt,
		};

		const preview = await autumnV2_2.billing.previewMultiAttach(params);
		expect(preview.total).toBeGreaterThan(40);
		const result = await autumnV2_2.billing.multiAttach(params);
		const customer = await autumnV1.customers.get<ApiCustomerV3>(customerId);
		const customerProducts = await Promise.all(
			[plan.id, addOn.id].map((productId) =>
				getCustomerProduct({ ctx, customerId, productId }),
			),
		);
		expect(
			customerProducts.every(({ starts_at }) => starts_at === startsAt),
		).toBe(true);
		expect(
			new Set(
				customerProducts.flatMap(({ subscription_ids }) => subscription_ids),
			).size,
		).toBe(1);
		await expectCustomerInvoiceCorrect({
			customer,
			count: 1,
			latestTotal: result.invoice!.total,
		});
		await expectBackdatedStripeSubscriptionCorrect({
			ctx,
			stripeSubscriptionId: customerProducts[0]!.subscription_ids![0]!,
			startsAt,
			stripeInvoiceId: result.invoice!.stripe_id,
			minInvoiceTotal: 4000,
			minInvoiceLineCount: 4,
		});
	},
);

test.concurrent(
	`${chalk.yellowBright("multi-attach backdate: preview and execution reject Stripe Checkout")}`,
	async () => {
		const customerId = "multi-attach-backdate-checkout";
		const plan = products.pro({
			id: "plan",
			items: [items.monthlyMessages({ includedUsage: 100 })],
		});
		const addOn = products.recurringAddOn({
			id: "add-on",
			items: [items.monthlyUsers({ includedUsage: 5 })],
		});
		const { autumnV2_2, advancedTo } = await initScenario({
			customerId,
			setup: [s.customer({}), s.products({ list: [plan, addOn] })],
			actions: [],
		});
		const params: MultiAttachParamsV0Input = {
			customer_id: customerId,
			plans: [{ plan_id: plan.id }, { plan_id: addOn.id }],
			starts_at: advancedTo - ms.days(10),
		};
		const expectedError = {
			errCode: "invalid_request",
			errMessage:
				"Past starts_at cannot be used when Stripe Checkout is required",
		};

		await expectAutumnError({
			...expectedError,
			func: () => autumnV2_2.billing.previewMultiAttach(params),
		});
		await expectAutumnError({
			...expectedError,
			func: () => autumnV2_2.billing.multiAttach(params),
		});
	},
);
