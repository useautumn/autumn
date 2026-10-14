import { test } from "bun:test";
import { items } from "@tests/utils/fixtures/items";
import { products } from "@tests/utils/fixtures/products";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario";
import chalk from "chalk";

test(
	`${chalk.yellowBright("autumn-checkout: free → pro with trial (card on file) - Trial start")}`,
	async () => {
		const customerId = "checkout-trial-start";

		const free = products.base({
			id: "free",
			items: [items.dashboard()],
			isDefault: true,
		});

		const proTrial = products.proWithTrial({
			id: "pro-trial",
			items: [
				items.dashboard(),
				items.adminRights(),
				items.monthlyMessages({ includedUsage: 500 }),
			],
			trialDays: 7,
			cardRequired: true,
		});

		const { autumnV1 } = await initScenario({
			customerId,
			setup: [
				s.customer({ paymentMethod: "success", withDefault: true }),
				s.products({ list: [free, proTrial] }),
			],
			actions: [],
		});

		const customerBefore = await autumnV1.customers.get(customerId);
		console.log("customer before trial start:", {
			products: customerBefore.products?.map(
				(p: { id: string; name: string | null }) => ({
					id: p.id,
					name: p.name,
				}),
			),
		});

		const trialResult = await autumnV1.billing.attach({
			customer_id: customerId,
			product_id: `pro-trial_${customerId}`,
			redirect_mode: "always",
		});
		console.log("trial start result:", trialResult);
	},
	{ timeout: 30000 },
);
