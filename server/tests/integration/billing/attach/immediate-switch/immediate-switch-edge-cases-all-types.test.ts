import { expect, test } from "bun:test";
import type { ApiCustomerV3 } from "@autumn/shared";
import { expectCustomerFeatureCorrect } from "@tests/integration/billing/utils/expectCustomerFeatureCorrect";
import { expectCustomerInvoiceCorrect } from "@tests/integration/billing/utils/expectCustomerInvoiceCorrect";
import { expectCustomerProducts } from "@tests/integration/billing/utils/expectCustomerProductCorrect";
import { calculateProratedDiff } from "@tests/integration/billing/utils/proration";
import { TestFeature } from "@tests/setup/v2Features";
import { items } from "@tests/utils/fixtures/items";
import { products } from "@tests/utils/fixtures/products";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario";
import chalk from "chalk";

test.concurrent(
	`${chalk.yellowBright("immediate-switch-edge-cases 1: all feature types - boolean, consumable, allocated")}`,
	async () => {
		const customerId = "imm-switch-all-types";

		const pro = products.pro({
			id: "pro",
			items: [
				items.dashboard(),
				items.consumableMessages({ includedUsage: 100 }),
				items.allocatedUsers({ includedUsage: 3 }),
			],
		});

		const premium = products.premium({
			id: "premium",
			items: [
				items.dashboard(),
				items.adminRights(),
				items.consumableMessages({ includedUsage: 500 }),
				items.allocatedUsers({ includedUsage: 10 }),
			],
		});

		const { autumnV1 } = await initScenario({
			customerId,
			setup: [
				s.customer({ paymentMethod: "success" }),
				s.products({ list: [pro, premium] }),
			],
			actions: [s.billing.attach({ productId: pro.id })],
		});

		await new Promise((r) => setTimeout(r, 4000));

		await autumnV1.track({
			customer_id: customerId,
			feature_id: TestFeature.Messages,
			value: 50,
		});

		await autumnV1.track({
			customer_id: customerId,
			feature_id: TestFeature.Users,
			value: 2,
		});

		await new Promise((r) => setTimeout(r, 2000));

		const customerBefore =
			await autumnV1.customers.get<ApiCustomerV3>(customerId);

		expectCustomerFeatureCorrect({
			customer: customerBefore,
			featureId: TestFeature.Messages,
			includedUsage: 100,
			balance: 50,
			usage: 50,
		});

		expectCustomerFeatureCorrect({
			customer: customerBefore,
			featureId: TestFeature.Users,
			includedUsage: 3,
			balance: 1,
			usage: 2,
		});

		const preview = await autumnV1.billing.previewAttach({
			customer_id: customerId,
			product_id: premium.id,
		});
		expect(preview.total).toBe(30);

		await autumnV1.billing.attach({
			customer_id: customerId,
			product_id: premium.id,
			redirect_mode: "if_required",
		});

		const customer = await autumnV1.customers.get<ApiCustomerV3>(customerId);

		await expectCustomerProducts({
			customer,
			active: [premium.id],
			notPresent: [pro.id],
		});

		expectCustomerFeatureCorrect({
			customer,
			featureId: TestFeature.Messages,
			includedUsage: 500,
			balance: 500,
			usage: 0,
		});

		expectCustomerFeatureCorrect({
			customer,
			featureId: TestFeature.Users,
			includedUsage: 10,
			balance: 8,
			usage: 2,
		});

		await expectCustomerInvoiceCorrect({
			customer,
			count: 2,
			latestTotal: 30,
		});
	},
);

test.concurrent(
	`${chalk.yellowBright("immediate-switch-edge-cases 2: all types mid-cycle with proration")}`,
	async () => {
		const customerId = "imm-switch-all-types-midcycle";

		const pro = products.pro({
			id: "pro",
			items: [
				items.consumableMessages({ includedUsage: 100 }),
				items.allocatedUsers({ includedUsage: 3 }),
			],
		});

		const premium = products.premium({
			id: "premium",
			items: [
				items.consumableMessages({ includedUsage: 500 }),
				items.allocatedUsers({ includedUsage: 10 }),
			],
		});

		const { autumnV1, advancedTo } = await initScenario({
			customerId,
			setup: [
				s.customer({ paymentMethod: "success" }),
				s.products({ list: [pro, premium] }),
			],
			actions: [
				s.billing.attach({ productId: pro.id }),
				s.advanceTestClock({ days: 15 }),
			],
		});

		await new Promise((r) => setTimeout(r, 4000));

		await autumnV1.track({
			customer_id: customerId,
			feature_id: TestFeature.Messages,
			value: 30,
		});

		await autumnV1.track({
			customer_id: customerId,
			feature_id: TestFeature.Users,
			value: 2,
		});

		await new Promise((r) => setTimeout(r, 2000));

		const expectedTotal = await calculateProratedDiff({
			customerId,
			advancedTo,
			oldAmount: 20,
			newAmount: 50,
		});

		const preview = await autumnV1.billing.previewAttach({
			customer_id: customerId,
			product_id: premium.id,
		});
		expect(preview.total).toBeCloseTo(expectedTotal, 0);

		await autumnV1.billing.attach({
			customer_id: customerId,
			product_id: premium.id,
			redirect_mode: "if_required",
		});

		const customer = await autumnV1.customers.get<ApiCustomerV3>(customerId);

		await expectCustomerProducts({
			customer,
			active: [premium.id],
			notPresent: [pro.id],
		});

		expectCustomerFeatureCorrect({
			customer,
			featureId: TestFeature.Messages,
			includedUsage: 500,
			balance: 500,
			usage: 0,
		});

		expectCustomerFeatureCorrect({
			customer,
			featureId: TestFeature.Users,
			includedUsage: 10,
			balance: 8,
			usage: 2,
		});

		await expectCustomerInvoiceCorrect({
			customer,
			count: 2,
			latestTotal: preview.total,
		});
	},
);
