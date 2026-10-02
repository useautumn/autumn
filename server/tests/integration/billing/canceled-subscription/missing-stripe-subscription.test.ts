/**
 * A Stripe subscription Autumn still references can disappear from Stripe.
 * Requests that reach it are answered as a 404 the caller can act on, not a 400 Stripe error.
 */

import { test } from "bun:test";
import {
	findActiveCustomerProductById,
	type UpdateSubscriptionV1ParamsInput,
} from "@autumn/shared";
import { expectAutumnError } from "@tests/utils/expectUtils/expectErrUtils";
import { items } from "@tests/utils/fixtures/items";
import { products } from "@tests/utils/fixtures/products";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario";
import chalk from "chalk";
import { CusService } from "@/internal/customers/CusService";
import { CusProductService } from "@/internal/customers/cusProducts/CusProductService";

test(`${chalk.yellowBright("missing stripe subscription: preview update answers 404 stripe_resource_missing")}`, async () => {
	const customerId = "missing-stripe-sub-preview-update";
	const pro = products.pro({
		id: "pro",
		items: [items.monthlyMessages({ includedUsage: 100 })],
	});

	const { ctx, autumnV2_4 } = await initScenario({
		customerId,
		setup: [
			s.customer({ paymentMethod: "success" }),
			s.products({ list: [pro] }),
		],
		actions: [s.attach({ productId: pro.id })],
	});

	const customerProduct = findActiveCustomerProductById({
		fullCus: await CusService.getFull({ ctx, idOrInternalId: customerId }),
		productId: pro.id,
	});
	if (!customerProduct) throw new Error(`No active ${pro.id} product`);

	await CusProductService.update({
		ctx,
		cusProductId: customerProduct.id,
		updates: { subscription_ids: ["sub_missing_from_stripe"] },
	});

	await expectAutumnError({
		errCode: "stripe_resource_missing",
		errMessage: "No such subscription: 'sub_missing_from_stripe'",
		func: () =>
			autumnV2_4.subscriptions.previewUpdate<UpdateSubscriptionV1ParamsInput>({
				customer_id: customerId,
				plan_id: pro.id,
				cancel_action: "cancel_end_of_cycle",
			}),
	});
});
