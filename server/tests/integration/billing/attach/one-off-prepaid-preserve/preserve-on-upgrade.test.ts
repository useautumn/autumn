import { test } from "bun:test";
import type { ApiCustomerV3 } from "@autumn/shared";
import { expectCustomerFeatureCorrect } from "@tests/integration/billing/utils/expectCustomerFeatureCorrect";
import { expectCustomerInvoiceCorrect } from "@tests/integration/billing/utils/expectCustomerInvoiceCorrect";
import { TestFeature } from "@tests/setup/v2Features";
import { items } from "@tests/utils/fixtures/items";
import { products } from "@tests/utils/fixtures/products";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario";
import chalk from "chalk";

test.concurrent(
	`${chalk.yellowBright("one-off-preserve attach 1: upgrade pro+one-off-prepaid → premium preserves remaining balance as lifetime cusEnt")}`,
	async () => {
		const customerId = "one-off-preserve-attach-upgrade";

		const proOneOff = items.oneOffMessages({
			includedUsage: 0,
			billingUnits: 100,
			price: 10,
		});
		const pro = products.pro({ id: "pro", items: [proOneOff] });

		const premiumMessages = items.monthlyMessages({ includedUsage: 500 });
		const premium = products.premium({
			id: "premium",
			items: [premiumMessages],
		});

		const { autumnV1, autumnV2_1, autumnV2_2 } = await initScenario({
			customerId,
			setup: [
				s.customer({ paymentMethod: "success" }),
				s.products({ list: [pro, premium] }),
			],
			actions: [
				s.attach({
					productId: pro.id,
					options: [{ feature_id: TestFeature.Messages, quantity: 200 }],
				}),
			],
		});

		await autumnV2_1.track({
			customer_id: customerId,
			feature_id: TestFeature.Messages,
			value: 50,
		});
		await new Promise((resolve) => setTimeout(resolve, 2000));

		await autumnV2_2.billing.attach({
			customer_id: customerId,
			plan_id: premium.id,
		});

		const customer = await autumnV1.customers.get<ApiCustomerV3>(customerId);

		expectCustomerFeatureCorrect({
			customer,
			featureId: TestFeature.Messages,
			balance: 650,
			usage: 0,
		});

		await expectCustomerInvoiceCorrect({
			customer,
			count: 2,
		});
	},
);

test.concurrent(
	`${chalk.yellowBright("one-off-preserve attach 2: preserves balance even when new product has no entitlement for the feature")}`,
	async () => {
		const customerId = "one-off-preserve-attach-no-feature";

		const proOneOff = items.oneOffMessages({
			includedUsage: 0,
			billingUnits: 100,
			price: 10,
		});
		const pro = products.pro({ id: "pro-nomsgs", items: [proOneOff] });

		const premiumNoMessages = products.premium({
			id: "premium-nomsgs",
			items: [items.dashboard()],
		});

		const { autumnV1, autumnV2_1, autumnV2_2 } = await initScenario({
			customerId,
			setup: [
				s.customer({ paymentMethod: "success" }),
				s.products({ list: [pro, premiumNoMessages] }),
			],
			actions: [
				s.attach({
					productId: pro.id,
					options: [{ feature_id: TestFeature.Messages, quantity: 200 }],
				}),
			],
		});

		await autumnV2_1.track({
			customer_id: customerId,
			feature_id: TestFeature.Messages,
			value: 50,
		});
		await new Promise((resolve) => setTimeout(resolve, 2000));

		await autumnV2_2.billing.attach({
			customer_id: customerId,
			plan_id: premiumNoMessages.id,
		});

		const customer = await autumnV1.customers.get<ApiCustomerV3>(customerId);

		expectCustomerFeatureCorrect({
			customer,
			featureId: TestFeature.Messages,
			balance: 150,
			usage: 0,
		});
	},
);

test.concurrent(
	`${chalk.yellowBright("one-off-preserve attach 3: zero balance on one-off prepaid is a silent no-op")}`,
	async () => {
		const customerId = "one-off-preserve-attach-zero";

		const proOneOff = items.oneOffMessages({
			includedUsage: 0,
			billingUnits: 100,
			price: 10,
		});
		const pro = products.pro({ id: "pro-zero", items: [proOneOff] });

		const premiumMessages = items.monthlyMessages({ includedUsage: 500 });
		const premium = products.premium({
			id: "premium-zero",
			items: [premiumMessages],
		});

		const { autumnV1, autumnV2_1, autumnV2_2 } = await initScenario({
			customerId,
			setup: [
				s.customer({ paymentMethod: "success" }),
				s.products({ list: [pro, premium] }),
			],
			actions: [
				s.attach({
					productId: pro.id,
					options: [{ feature_id: TestFeature.Messages, quantity: 100 }],
				}),
			],
		});

		await autumnV2_1.track({
			customer_id: customerId,
			feature_id: TestFeature.Messages,
			value: 100,
		});
		await new Promise((resolve) => setTimeout(resolve, 2000));

		await autumnV2_2.billing.attach({
			customer_id: customerId,
			plan_id: premium.id,
		});

		const customer = await autumnV1.customers.get<ApiCustomerV3>(customerId);

		expectCustomerFeatureCorrect({
			customer,
			featureId: TestFeature.Messages,
			balance: 500,
			usage: 0,
		});
	},
);

test.concurrent(
	`${chalk.yellowBright("one-off-preserve attach 4: mixed monthly + one-off prepaid only preserves the one-off cusEnt's remaining balance")}`,
	async () => {
		const customerId = "one-off-preserve-attach-mixed";

		const proMonthly = items.monthlyMessages({ includedUsage: 100 });
		const proOneOff = items.oneOffMessages({
			includedUsage: 0,
			billingUnits: 100,
			price: 10,
		});
		const pro = products.pro({
			id: "pro-mixed",
			items: [proMonthly, proOneOff],
		});

		const premiumMonthly = items.monthlyMessages({ includedUsage: 1000 });
		const premium = products.premium({
			id: "premium-mixed",
			items: [premiumMonthly],
		});

		const { autumnV1, autumnV2_1, autumnV2_2 } = await initScenario({
			customerId,
			setup: [
				s.customer({ paymentMethod: "success" }),
				s.products({ list: [pro, premium] }),
			],
			actions: [
				s.attach({
					productId: pro.id,
					options: [{ feature_id: TestFeature.Messages, quantity: 200 }],
				}),
			],
		});

		await autumnV2_1.track({
			customer_id: customerId,
			feature_id: TestFeature.Messages,
			value: 150,
		});
		await new Promise((resolve) => setTimeout(resolve, 2000));

		await autumnV2_2.billing.attach({
			customer_id: customerId,
			plan_id: premium.id,
		});

		const customer = await autumnV1.customers.get<ApiCustomerV3>(customerId);

		expectCustomerFeatureCorrect({
			customer,
			featureId: TestFeature.Messages,
			balance: 1150,
			usage: 0,
		});
	},
);
