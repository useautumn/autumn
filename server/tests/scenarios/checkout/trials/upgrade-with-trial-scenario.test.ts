import { test } from "bun:test";
import { items } from "@tests/utils/fixtures/items";
import { products } from "@tests/utils/fixtures/products";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario";
import chalk from "chalk";

test(`${chalk.yellowBright("autumn-checkout: pro → premium with trial - Upgrade with trial")}`, async () => {
	const customerId = "checkout-upgrade-trial";

	const pro = products.pro({
		id: "pro",
		items: [items.dashboard(), items.monthlyMessages({ includedUsage: 200 })],
	});

	const premiumTrial = products.premiumWithTrial({
		id: "premium-trial",
		items: [
			items.dashboard(),
			items.adminRights(),
			items.monthlyMessages({ includedUsage: 1000 }),
			items.consumableWords({ includedUsage: 500 }),
		],
		trialDays: 14,
		cardRequired: true,
	});

	const { autumnV1 } = await initScenario({
		customerId,
		setup: [
			s.customer({ paymentMethod: "success" }),
			s.products({ list: [pro, premiumTrial] }),
		],
		actions: [s.attach({ productId: "pro" })],
	});

	const customerBefore = await autumnV1.customers.get(customerId);
	console.log("customer before upgrade:", {
		products: customerBefore.products?.map((p: { id: string; name: string | null }) => ({
			id: p.id,
			name: p.name,
		})),
	});

	const upgradePreview = await autumnV1.billing.previewAttach({
		customer_id: customerId,
		product_id: `premium-trial_${customerId}`,
		redirect_mode: "always",
	});
	console.log("upgrade with trial preview:", upgradePreview);

	const upgradeResult = await autumnV1.billing.attach({
		customer_id: customerId,
		product_id: `premium-trial_${customerId}`,
		redirect_mode: "always",
	});
	console.log("upgrade with trial result:", upgradeResult);
});
