import { test } from "bun:test";
import type { ApiCustomerV3 } from "@autumn/shared";
import { expectCustomerFeatureCorrect } from "@tests/integration/billing/utils/expectCustomerFeatureCorrect";
import { expectCustomerInvoiceCorrect } from "@tests/integration/billing/utils/expectCustomerInvoiceCorrect";
import {
	expectCustomerProducts,
	expectProductActive,
} from "@tests/integration/billing/utils/expectCustomerProductCorrect";
import { expectSubToBeCorrect } from "@tests/merged/mergeUtils/expectSubCorrect";
import { TestFeature } from "@tests/setup/v2Features";
import { items } from "@tests/utils/fixtures/items";
import { products } from "@tests/utils/fixtures/products";
import ctx from "@tests/utils/testInitUtils/createTestContext";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario";
import chalk from "chalk";

test.concurrent(`${chalk.yellowBright("legacy-upgrade-custom 1: upgrade with custom higher price")}`, async () => {
	const customerId = "legacy-upgrade-custom-price";

	const messagesItem = items.monthlyMessages({ includedUsage: 100 });
	const proPrice = items.monthlyPrice({ price: 20 });
	const premiumPrice = items.monthlyPrice({ price: 50 });

	const pro = products.base({
		id: "pro",
		items: [messagesItem, proPrice],
	});
	const premium = products.base({
		id: "premium",
		items: [messagesItem, premiumPrice],
	});

	const { autumnV1 } = await initScenario({
		customerId,
		setup: [
			s.customer({ paymentMethod: "success" }),
			s.products({ list: [pro, premium] }),
		],
		actions: [s.attach({ productId: pro.id })],
	});

	const customerBefore =
		await autumnV1.customers.get<ApiCustomerV3>(customerId);
	await expectProductActive({
		customer: customerBefore,
		productId: pro.id,
	});

	const customHigherPrice = items.monthlyPrice({ price: 60 });
	await autumnV1.attach({
		customer_id: customerId,
		product_id: premium.id,
		is_custom: true,
		items: [messagesItem, customHigherPrice],
	});

	const customer = await autumnV1.customers.get<ApiCustomerV3>(customerId);

	await expectCustomerProducts({
		customer,
		active: [premium.id],
		notPresent: [pro.id],
	});

	await expectCustomerInvoiceCorrect({
		customer,
		count: 2,
		latestTotal: 60 - 20,
	});

	await expectSubToBeCorrect({
		db: ctx.db,
		customerId,
		org: ctx.org,
		env: ctx.env,
	});
});

test.concurrent(`${chalk.yellowBright("legacy-upgrade-custom 2: upgrade with custom feature addition")}`, async () => {
	const customerId = "legacy-upgrade-custom-feature";

	const messagesItem = items.monthlyMessages({ includedUsage: 100 });
	const proPrice = items.monthlyPrice({ price: 20 });
	const premiumPrice = items.monthlyPrice({ price: 50 });

	const pro = products.base({
		id: "pro",
		items: [messagesItem, proPrice],
	});
	const premium = products.base({
		id: "premium",
		items: [messagesItem, premiumPrice],
	});

	const { autumnV1 } = await initScenario({
		customerId,
		setup: [
			s.customer({ paymentMethod: "success" }),
			s.products({ list: [pro, premium] }),
		],
		actions: [s.attach({ productId: pro.id })],
	});

	const customerBefore =
		await autumnV1.customers.get<ApiCustomerV3>(customerId);
	await expectProductActive({
		customer: customerBefore,
		productId: pro.id,
	});

	const wordsItem = items.monthlyWords({ includedUsage: 200 });
	await autumnV1.attach({
		customer_id: customerId,
		product_id: premium.id,
		is_custom: true,
		items: [messagesItem, wordsItem, premiumPrice],
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
		includedUsage: 100,
		balance: 100,
		usage: 0,
	});

	expectCustomerFeatureCorrect({
		customer,
		featureId: TestFeature.Words,
		includedUsage: 200,
		balance: 200,
		usage: 0,
	});

	await expectCustomerInvoiceCorrect({
		customer,
		count: 2,
		latestTotal: 50 - 20,
	});

	await expectSubToBeCorrect({
		db: ctx.db,
		customerId,
		org: ctx.org,
		env: ctx.env,
	});
});

test.concurrent(`${chalk.yellowBright("legacy-upgrade-custom 3: upgrade with custom included usage")}`, async () => {
	const customerId = "legacy-upgrade-custom-usage";

	const messagesItem = items.monthlyMessages({ includedUsage: 100 });
	const proPrice = items.monthlyPrice({ price: 20 });
	const premiumPrice = items.monthlyPrice({ price: 50 });

	const pro = products.base({
		id: "pro",
		items: [messagesItem, proPrice],
	});
	const premium = products.base({
		id: "premium",
		items: [messagesItem, premiumPrice],
	});

	const { autumnV1 } = await initScenario({
		customerId,
		setup: [
			s.customer({ paymentMethod: "success" }),
			s.products({ list: [pro, premium] }),
		],
		actions: [s.attach({ productId: pro.id })],
	});

	const customerBefore =
		await autumnV1.customers.get<ApiCustomerV3>(customerId);
	await expectProductActive({
		customer: customerBefore,
		productId: pro.id,
	});
	expectCustomerFeatureCorrect({
		customer: customerBefore,
		featureId: TestFeature.Messages,
		includedUsage: 100,
		balance: 100,
	});

	const higherUsageItem = items.monthlyMessages({ includedUsage: 500 });
	await autumnV1.attach({
		customer_id: customerId,
		product_id: premium.id,
		is_custom: true,
		items: [higherUsageItem, premiumPrice],
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

	await expectCustomerInvoiceCorrect({
		customer,
		count: 2,
		latestTotal: 50 - 20,
	});

	await expectSubToBeCorrect({
		db: ctx.db,
		customerId,
		org: ctx.org,
		env: ctx.env,
	});
});

test.concurrent(`${chalk.yellowBright("legacy-upgrade-custom 4: upgrade with custom billing interval")}`, async () => {
	const customerId = "legacy-upgrade-custom-interval";

	const messagesItem = items.monthlyMessages({ includedUsage: 100 });
	const proPrice = items.monthlyPrice({ price: 20 });
	const premiumPrice = items.monthlyPrice({ price: 50 });

	const pro = products.base({
		id: "pro",
		items: [messagesItem, proPrice],
	});
	const premium = products.base({
		id: "premium",
		items: [messagesItem, premiumPrice],
	});

	const { autumnV1 } = await initScenario({
		customerId,
		setup: [
			s.customer({ paymentMethod: "success" }),
			s.products({ list: [pro, premium] }),
		],
		actions: [s.attach({ productId: pro.id })],
	});

	const customerBefore =
		await autumnV1.customers.get<ApiCustomerV3>(customerId);
	await expectProductActive({
		customer: customerBefore,
		productId: pro.id,
	});

	const annualPrice = items.annualPrice({ price: 200 });
	await autumnV1.attach({
		customer_id: customerId,
		product_id: premium.id,
		is_custom: true,
		items: [messagesItem, annualPrice],
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
		includedUsage: 100,
		balance: 100,
		usage: 0,
	});

	await expectCustomerInvoiceCorrect({
		customer,
		count: 2,
	});

	await expectSubToBeCorrect({
		db: ctx.db,
		customerId,
		org: ctx.org,
		env: ctx.env,
	});
});
