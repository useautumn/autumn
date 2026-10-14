import { expect, test } from "bun:test";
import type { ApiCustomerV3 } from "@autumn/shared";
import { expectCustomerFeatureCorrect } from "@tests/integration/billing/utils/expectCustomerFeatureCorrect";
import { expectCustomerProducts } from "@tests/integration/billing/utils/expectCustomerProductCorrect";
import { TestFeature } from "@tests/setup/v2Features";
import { items } from "@tests/utils/fixtures/items";
import { products } from "@tests/utils/fixtures/products";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario";
import chalk from "chalk";
import { addMonths } from "date-fns";

test.concurrent(
	`${chalk.yellowBright("immediate-switch-reset 5: free to paid preserves reset_at anchor")}`,
	async () => {
		const customerId = "reset-free-to-paid";

		const freeMessages = items.monthlyMessages({ includedUsage: 50 });
		const free = products.base({
			id: "free",
			items: [freeMessages],
		});

		const proMessages = items.monthlyMessages({ includedUsage: 100 });
		const pro = products.pro({
			id: "pro",
			items: [proMessages],
		});

		const { autumnV1, advancedTo } = await initScenario({
			customerId,
			setup: [
				s.customer({ testClock: true, paymentMethod: "success" }),
				s.products({ list: [free, pro] }),
			],
			actions: [
				s.billing.attach({ productId: free.id }),
				s.advanceTestClock({ days: 15 }),
			],
		});

		await new Promise((r) => setTimeout(r, 4000));

		await autumnV1.track({
			customer_id: customerId,
			feature_id: TestFeature.Messages,
			value: 20,
		});

		await new Promise((r) => setTimeout(r, 2000));

		const customerBefore =
			await autumnV1.customers.get<ApiCustomerV3>(customerId);
		const freeResetAt =
			customerBefore.features[TestFeature.Messages]?.next_reset_at;
		expect(freeResetAt).toBeDefined();

		await autumnV1.billing.attach({
			customer_id: customerId,
			product_id: pro.id,
			redirect_mode: "if_required",
		});

		const customer = await autumnV1.customers.get<ApiCustomerV3>(customerId);

		await expectCustomerProducts({
			customer,
			active: [pro.id],
			notPresent: [free.id],
		});

		const newResetAt = customer.features[TestFeature.Messages]?.next_reset_at;
		expect(newResetAt).toBeDefined();

		expectCustomerFeatureCorrect({
			customer,
			featureId: TestFeature.Messages,
			includedUsage: 100,
			balance: 100,
			usage: 0,
			resetsAt: addMonths(advancedTo, 1).getTime(),
		});
	},
);

test.concurrent(
	`${chalk.yellowBright("immediate-switch-reset 6: monthly to annual preserves reset_at anchor")}`,
	async () => {
		const customerId = "reset-monthly-to-annual";

		const proMonthlyMessages = items.monthlyMessages({ includedUsage: 100 });
		const proMonthly = products.pro({
			id: "pro-monthly",
			items: [proMonthlyMessages],
		});

		const proAnnualMessages = items.monthlyMessages({ includedUsage: 100 });
		const proAnnual = products.proAnnual({
			id: "pro-annual",
			items: [proAnnualMessages],
		});

		const { autumnV1 } = await initScenario({
			customerId,
			setup: [
				s.customer({ testClock: true, paymentMethod: "success" }),
				s.products({ list: [proMonthly, proAnnual] }),
			],
			actions: [
				s.billing.attach({ productId: proMonthly.id }),
				s.advanceTestClock({ days: 15 }),
			],
		});

		await new Promise((r) => setTimeout(r, 4000));

		await autumnV1.track({
			customer_id: customerId,
			feature_id: TestFeature.Messages,
			value: 30,
		});

		await new Promise((r) => setTimeout(r, 2000));

		const customerBefore =
			await autumnV1.customers.get<ApiCustomerV3>(customerId);
		const monthlyResetAt =
			customerBefore.features[TestFeature.Messages]?.next_reset_at;
		expect(monthlyResetAt).toBeDefined();

		await autumnV1.billing.attach({
			customer_id: customerId,
			product_id: proAnnual.id,
			redirect_mode: "if_required",
		});

		const customer = await autumnV1.customers.get<ApiCustomerV3>(customerId);

		await expectCustomerProducts({
			customer,
			active: [proAnnual.id],
			notPresent: [proMonthly.id],
		});

		const newResetAt = customer.features[TestFeature.Messages]?.next_reset_at;
		expect(newResetAt).toBeDefined();

		expect(newResetAt).toBe(monthlyResetAt);

		expectCustomerFeatureCorrect({
			customer,
			featureId: TestFeature.Messages,
			includedUsage: 100,
			balance: 100,
			usage: 0,
			resetsAt: monthlyResetAt!,
		});
	},
);
