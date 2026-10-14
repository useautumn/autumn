import { expect, test } from "bun:test";
import {
	type AttachParamsV1Input,
	CusProductStatus,
	customers,
	FreeTrialDuration,
} from "@autumn/shared";
import { completeStripeCheckoutFormV2 as completeStripeCheckoutForm } from "@tests/utils/browserPool/completeStripeCheckoutFormV2";
import { items } from "@tests/utils/fixtures/items";
import { itemsV2 } from "@tests/utils/fixtures/itemsV2";
import { products } from "@tests/utils/fixtures/products";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario";
import chalk from "chalk";
import { eq } from "drizzle-orm";
import { CusProductService } from "@/internal/customers/cusProducts/CusProductService";

const attachCustomizedThroughCheckout = async ({
	customerId,
	customize,
}: {
	customerId: string;
	customize: AttachParamsV1Input["customize"];
}) => {
	const pro = products.pro({
		id: "pro",
		items: [items.monthlyMessages({ includedUsage: 100 })],
	});

	const { autumnV2_3, ctx } = await initScenario({
		customerId,
		setup: [s.customer({ testClock: true }), s.products({ list: [pro] })],
		actions: [],
	});

	const result = await autumnV2_3.billing.attach<AttachParamsV1Input>({
		customer_id: customerId,
		plan_id: pro.id,
		enable_plan_immediately: true,
		customize,
	});
	expect(result.payment_url).toContain("checkout.stripe.com");

	await completeStripeCheckoutForm({ url: result.payment_url! });

	const dbCustomer = await ctx.db.query.customers.findFirst({
		where: eq(customers.id, customerId),
	});
	const customerProducts = await CusProductService.list({
		db: ctx.db,
		internalCustomerId: dbCustomer!.internal_id,
		inStatuses: [CusProductStatus.Active, CusProductStatus.Trialing],
	});
	return customerProducts.find((cp) => cp.product.id === pro.id);
};

test.concurrent(
	`${chalk.yellowBright("stripe-checkout enable_plan_immediately: custom free_trial links sub")}`,
	async () => {
		const customerProduct = await attachCustomizedThroughCheckout({
			customerId: "stripe-checkout-eppi-custom-trial",
			customize: {
				free_trial: {
					duration_length: 7,
					duration_type: FreeTrialDuration.Day,
					card_required: true,
				},
			},
		});

		expect(customerProduct?.subscription_ids ?? []).toHaveLength(1);
	},
);

test.concurrent(
	`${chalk.yellowBright("stripe-checkout enable_plan_immediately: custom price links sub")}`,
	async () => {
		const customerProduct = await attachCustomizedThroughCheckout({
			customerId: "stripe-checkout-eppi-custom-price",
			customize: { price: itemsV2.monthlyPrice({ amount: 30 }) },
		});

		expect(customerProduct?.subscription_ids ?? []).toHaveLength(1);
	},
);

test.concurrent(
	`${chalk.yellowBright("stripe-checkout enable_plan_immediately: custom items links sub")}`,
	async () => {
		const customerProduct = await attachCustomizedThroughCheckout({
			customerId: "stripe-checkout-eppi-custom-items",
			customize: { items: [itemsV2.monthlyMessages({ included: 250 })] },
		});

		expect(customerProduct?.subscription_ids ?? []).toHaveLength(1);
	},
);
