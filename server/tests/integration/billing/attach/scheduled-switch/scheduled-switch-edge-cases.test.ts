import { test } from "bun:test";
import type { ApiCustomerV3 } from "@autumn/shared";
import { expectCustomerFeatureCorrect } from "@tests/integration/billing/utils/expectCustomerFeatureCorrect";
import { expectCustomerInvoiceCorrect } from "@tests/integration/billing/utils/expectCustomerInvoiceCorrect";
import {
	expectProductCanceling,
	expectProductNotPresent,
	expectProductScheduled,
} from "@tests/integration/billing/utils/expectCustomerProductCorrect";
import { expectSubToBeCorrect } from "@tests/merged/mergeUtils/expectSubCorrect";
import { TestFeature } from "@tests/setup/v2Features";
import { items } from "@tests/utils/fixtures/items";
import { products } from "@tests/utils/fixtures/products";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario";
import chalk from "chalk";

test.concurrent(`${chalk.yellowBright("scheduled-switch-edge-cases 1: multiple scheduled changes on same entity")}`, async () => {
	const customerId = "sched-switch-multi-changes";

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

	const premiumMessages = items.monthlyMessages({ includedUsage: 500 });
	const premium = products.premium({
		id: "premium",
		items: [premiumMessages],
	});

	const growthMessages = items.monthlyMessages({ includedUsage: 1000 });
	const growth = products.growth({
		id: "growth",
		items: [growthMessages],
	});

	const { autumnV1, ctx } = await initScenario({
		customerId,
		setup: [
			s.customer({ paymentMethod: "success" }),
			s.products({ list: [free, pro, premium, growth] }),
		],
		actions: [s.billing.attach({ productId: growth.id })],
	});

	await expectSubToBeCorrect({
		db: ctx.db,
		customerId,
		org: ctx.org,
		env: ctx.env,
	});

	await autumnV1.billing.attach({
		customer_id: customerId,
		product_id: free.id,
		redirect_mode: "if_required",
	});

	let customer = await autumnV1.customers.get<ApiCustomerV3>(customerId);
	await expectProductCanceling({
		customer,
		productId: growth.id,
	});
	await expectProductScheduled({
		customer,
		productId: free.id,
	});

	await expectSubToBeCorrect({
		db: ctx.db,
		customerId,
		org: ctx.org,
		env: ctx.env,
	});

	await autumnV1.billing.attach({
		customer_id: customerId,
		product_id: pro.id,
		redirect_mode: "if_required",
	});

	customer = await autumnV1.customers.get<ApiCustomerV3>(customerId);
	await expectProductCanceling({
		customer,
		productId: growth.id,
	});
	await expectProductScheduled({
		customer,
		productId: pro.id,
	});
	await expectProductNotPresent({
		customer,
		productId: free.id,
	});

	await expectSubToBeCorrect({
		db: ctx.db,
		customerId,
		org: ctx.org,
		env: ctx.env,
	});

	await autumnV1.billing.attach({
		customer_id: customerId,
		product_id: premium.id,
		redirect_mode: "if_required",
	});

	customer = await autumnV1.customers.get<ApiCustomerV3>(customerId);
	await expectProductCanceling({
		customer,
		productId: growth.id,
	});
	await expectProductScheduled({
		customer,
		productId: premium.id,
	});
	await expectProductNotPresent({
		customer,
		productId: pro.id,
	});

	await expectSubToBeCorrect({
		db: ctx.db,
		customerId,
		org: ctx.org,
		env: ctx.env,
	});

	await autumnV1.billing.attach({
		customer_id: customerId,
		product_id: free.id,
		redirect_mode: "if_required",
	});

	customer = await autumnV1.customers.get<ApiCustomerV3>(customerId);
	await expectProductCanceling({
		customer,
		productId: growth.id,
	});
	await expectProductScheduled({
		customer,
		productId: free.id,
	});
	await expectProductNotPresent({
		customer,
		productId: premium.id,
	});

	await expectSubToBeCorrect({
		db: ctx.db,
		customerId,
		org: ctx.org,
		env: ctx.env,
	});

	expectCustomerFeatureCorrect({
		customer,
		featureId: TestFeature.Messages,
		includedUsage: 1000,
		balance: 1000,
		usage: 0,
	});

	await expectCustomerInvoiceCorrect({
		customer,
		count: 1,
		latestTotal: 100,
	});
});
