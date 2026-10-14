import { expect, test } from "bun:test";
import type { ApiCustomerV3 } from "@autumn/shared";
import { findCustomerEntitlement } from "@tests/balances/utils/findCustomerEntitlement.js";
import { expectCustomerFeatureCorrect } from "@tests/integration/billing/utils/expectCustomerFeatureCorrect";
import { TestFeature } from "@tests/setup/v2Features";
import { items } from "@tests/utils/fixtures/items";
import { products } from "@tests/utils/fixtures/products";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario";
import chalk from "chalk";

test.concurrent(
	`${chalk.yellowBright("carry-over-usage 1: existing usage is deducted from new plan allowance on upgrade")}`,
	async () => {
		const proMessages = items.monthlyMessages({ includedUsage: 50 });
		const premiumMessages = items.monthlyMessages({ includedUsage: 200 });

		const pro = products.pro({ id: "pro", items: [proMessages] });
		const premium = products.premium({
			id: "premium",
			items: [premiumMessages],
		});

		const { customerId, autumnV2_1, autumnV1 } = await initScenario({
			customerId: "carry-over-usage-basic1",
			setup: [
				s.customer({ paymentMethod: "success" }),
				s.products({ list: [pro, premium] }),
			],
			actions: [s.attach({ productId: pro.id, timeout: 4000 })],
		});

		await autumnV2_1.track({
			customer_id: customerId,
			feature_id: TestFeature.Messages,
			value: 40,
		});

		await new Promise((resolve) => setTimeout(resolve, 2000));

		await autumnV2_1.billing.attach({
			customer_id: customerId,
			plan_id: premium.id,
			carry_over_usages: { enabled: true },
		});

		await new Promise((resolve) => setTimeout(resolve, 2000));

		const customer = await autumnV1.customers.get<ApiCustomerV3>(customerId);

		expectCustomerFeatureCorrect({
			customer,
			featureId: TestFeature.Messages,
			balance: 160,
			usage: 40,
		});
	},
);

test.concurrent(
	`${chalk.yellowBright("carry-over-usage invoice credit: tier position follows the carried balance usage")}`,
	async () => {
		const oldCredits = items.consumable({
			featureId: TestFeature.InvoiceCredits,
			includedUsage: 1_000,
			price: 1,
			billingUnits: 1,
		});
		const newCredits = items.consumable({
			featureId: TestFeature.InvoiceCredits,
			includedUsage: 2_000,
			price: 1,
			billingUnits: 1,
		});
		const oldPlan = products.pro({
			id: "invoice-credit-carry-old",
			items: [oldCredits],
		});
		const newPlan = products.premium({
			id: "invoice-credit-carry-new",
			items: [newCredits],
		});

		const { customerId, autumnV2_3, ctx } = await initScenario({
			customerId: "carry-over-usage-invoice-credit",
			setup: [
				s.customer({ paymentMethod: "success" }),
				s.products({ list: [oldPlan, newPlan] }),
			],
			actions: [s.attach({ productId: oldPlan.id, timeout: 4_000 })],
		});

		await autumnV2_3.track({
			customer_id: customerId,
			feature_id: TestFeature.Action1,
			value: 100,
		});
		await new Promise((resolve) => setTimeout(resolve, 2_000));
		await autumnV2_3.billing.attach({
			customer_id: customerId,
			plan_id: newPlan.id,
			carry_over_usages: { enabled: true },
		});

		const customerEntitlement = await findCustomerEntitlement({
			ctx,
			customerId,
			featureId: TestFeature.InvoiceCredits,
		});
		const sourceInternalFeatureId = ctx.features.find(
			(feature) => feature.id === TestFeature.Action1,
		)?.internal_id;
		expect(sourceInternalFeatureId).toBeDefined();
		expect(customerEntitlement?.balance).toBeCloseTo(1_980, 10);
		expect(
			customerEntitlement?.usage_attribution?.[sourceInternalFeatureId!],
		).toEqual({ units: 100, credits: 20 });
	},
	{ timeout: 120_000 },
);

test.concurrent(
	`${chalk.yellowBright("carry-over-usage 2: zero usage is a no-op — new plan starts at full allowance")}`,
	async () => {
		const proMessages = items.monthlyMessages({ includedUsage: 50 });
		const premiumMessages = items.monthlyMessages({ includedUsage: 200 });

		const pro = products.pro({ id: "pro", items: [proMessages] });
		const premium = products.premium({
			id: "premium",
			items: [premiumMessages],
		});

		const { customerId, autumnV2_1, autumnV1 } = await initScenario({
			customerId: "carry-over-usage-zero",
			setup: [
				s.customer({ paymentMethod: "success" }),
				s.products({ list: [pro, premium] }),
			],
			actions: [s.attach({ productId: pro.id, timeout: 4000 })],
		});

		await autumnV2_1.billing.attach({
			customer_id: customerId,
			plan_id: premium.id,
			carry_over_usages: { enabled: true },
		});

		await new Promise((resolve) => setTimeout(resolve, 2000));

		const customer = await autumnV1.customers.get<ApiCustomerV3>(customerId);

		expectCustomerFeatureCorrect({
			customer,
			featureId: TestFeature.Messages,
			balance: 200,
			usage: 0,
		});
	},
);

test.concurrent(
	`${chalk.yellowBright("carry-over-usage 3: balance goes negative when carried usage exceeds new plan allowance")}`,
	async () => {
		const proMessages = items.monthlyMessages({ includedUsage: 50 });
		const premiumMessages = items.monthlyMessages({ includedUsage: 30 });

		const pro = products.pro({ id: "pro", items: [proMessages] });
		const premium = products.premium({
			id: "premium",
			items: [premiumMessages],
		});

		const { customerId, autumnV2_1, autumnV1 } = await initScenario({
			customerId: "carry-over-usage-clamp",
			setup: [
				s.customer({ paymentMethod: "success" }),
				s.products({ list: [pro, premium] }),
			],
			actions: [s.attach({ productId: pro.id, timeout: 4000 })],
		});

		await autumnV2_1.track({
			customer_id: customerId,
			feature_id: TestFeature.Messages,
			value: 50,
		});

		await new Promise((resolve) => setTimeout(resolve, 2000));

		await autumnV2_1.billing.attach({
			customer_id: customerId,
			plan_id: premium.id,
			carry_over_usages: { enabled: true },
		});

		await new Promise((resolve) => setTimeout(resolve, 2000));

		const customer = await autumnV1.customers.get<ApiCustomerV3>(customerId);

		expectCustomerFeatureCorrect({
			customer,
			featureId: TestFeature.Messages,
			balance: -20,
			usage: 50,
		});
	},
);
