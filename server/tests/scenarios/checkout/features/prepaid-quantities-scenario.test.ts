import { test } from "bun:test";
import type { AttachParamsV1Input } from "@autumn/shared";
import { TestFeature } from "@tests/setup/v2Features";
import { items } from "@tests/utils/fixtures/items";
import { products } from "@tests/utils/fixtures/products";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario";
import chalk from "chalk";

test(`${chalk.yellowBright("attach: prepaid quantities - with adjustable prepaid options")}`, async () => {
	const customerId = "prepaid-quantities";

	const starter = products.base({
		id: "starter",
		items: [items.dashboard(), items.monthlyPrice({ price: 1 })],
	});

	const pro = products.pro({
		id: "pro",
		items: [
			items.dashboard(),
			items.prepaidMessages({ includedUsage: 100, billingUnits: 100 }),
			items.prepaidUsers({ includedUsage: 2, billingUnits: 1 }),
		],
	});

	const { autumnV2_2 } = await initScenario({
		customerId,
		setup: [
			s.customer({ paymentMethod: "success" }),
			s.products({ list: [starter, pro] }),
		],
		actions: [s.attach({ productId: starter.id })],
	});

	const attachResult = await autumnV2_2.billing.attach<AttachParamsV1Input>({
		customer_id: customerId,
		plan_id: `pro_${customerId}`,
		feature_quantities: [
			{ feature_id: TestFeature.Messages, quantity: 500, adjustable: true },
			{ feature_id: TestFeature.Users, quantity: 5, adjustable: true },
		],
		redirect_mode: "always",
	});

	console.log("prepaid quantities scenario:", {
		customerId,
		checkoutUrl: attachResult.payment_url,
	});
});
