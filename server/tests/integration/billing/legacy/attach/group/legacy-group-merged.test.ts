/** biome-ignore-all lint/suspicious/noExplicitAny: test file */

import { test } from "bun:test";
import type { ApiCustomerV3, CusProductStatus } from "@autumn/shared";
import { expectSubToBeCorrect } from "@tests/merged/mergeUtils/expectSubCorrect";
import { expectProductAttached } from "@tests/utils/expectUtils/expectProductAttached";
import { items } from "@tests/utils/fixtures/items";
import { products } from "@tests/utils/fixtures/products";
import ctx from "@tests/utils/testInitUtils/createTestContext";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario";
import chalk from "chalk";

test.concurrent(`${chalk.yellowBright("legacy-group-merged 1: upgrade in one group, other group unaffected")}`, async () => {
	const customerId = "legacy-group-merged-1";

	const wordsItem = items.consumableWords();
	const proPrice = items.monthlyPrice({ price: 20 });
	const premiumPrice = items.monthlyPrice({ price: 50 });

	const g1Pro = products.base({
		id: "g1-pro",
		items: [wordsItem, proPrice],
		group: "group-1",
	});
	const g1Premium = products.base({
		id: "g1-premium",
		items: [wordsItem, premiumPrice],
		group: "group-1",
	});
	const g2Pro = products.base({
		id: "g2-pro",
		items: [wordsItem, proPrice],
		group: "group-2",
	});
	const g2Premium = products.base({
		id: "g2-premium",
		items: [wordsItem, premiumPrice],
		group: "group-2",
	});

	const { autumnV1 } = await initScenario({
		customerId,
		setup: [
			s.customer({ paymentMethod: "success" }),
			s.products({ list: [g1Pro, g1Premium, g2Pro, g2Premium] }),
		],
		actions: [s.attach({ productId: g1Pro.id })],
	});

	let customer = await autumnV1.customers.get<ApiCustomerV3>(customerId);
	expectProductAttached({
		customer: customer as any,
		productId: g1Pro.id,
		status: "active" as unknown as CusProductStatus,
	});

	await autumnV1.attach({
		customer_id: customerId,
		product_id: g2Pro.id,
	});

	customer = await autumnV1.customers.get<ApiCustomerV3>(customerId);
	expectProductAttached({
		customer: customer as any,
		productId: g1Pro.id,
		status: "active" as unknown as CusProductStatus,
	});
	expectProductAttached({
		customer: customer as any,
		productId: g2Pro.id,
		status: "active" as unknown as CusProductStatus,
	});

	await autumnV1.attach({
		customer_id: customerId,
		product_id: g1Premium.id,
	});

	customer = await autumnV1.customers.get<ApiCustomerV3>(customerId);
	expectProductAttached({
		customer: customer as any,
		productId: g1Premium.id,
		status: "active" as unknown as CusProductStatus,
	});
	expectProductAttached({
		customer: customer as any,
		productId: g2Pro.id,
		status: "active" as unknown as CusProductStatus,
	});

	await autumnV1.attach({
		customer_id: customerId,
		product_id: g1Pro.id,
	});

	customer = await autumnV1.customers.get<ApiCustomerV3>(customerId);
	expectProductAttached({
		customer: customer as any,
		productId: g1Premium.id,
		status: "active" as unknown as CusProductStatus,
	});
	expectProductAttached({
		customer: customer as any,
		productId: g2Pro.id,
		status: "active" as unknown as CusProductStatus,
	});
	expectProductAttached({
		customer: customer as any,
		productId: g1Pro.id,
		status: "scheduled" as unknown as CusProductStatus,
	});

	await expectSubToBeCorrect({
		db: ctx.db,
		customerId,
		org: ctx.org,
		env: ctx.env,
	});
});

test.concurrent(`${chalk.yellowBright("legacy-group-merged 2: downgrade in one group, other group unaffected")}`, async () => {
	const customerId = "legacy-group-merged-2";

	const wordsItem = items.consumableWords();
	const proPrice = items.monthlyPrice({ price: 20 });
	const premiumPrice = items.monthlyPrice({ price: 50 });

	const g1Pro = products.base({
		id: "g1-pro",
		items: [wordsItem, proPrice],
		group: "group-1",
	});
	const g1Premium = products.base({
		id: "g1-premium",
		items: [wordsItem, premiumPrice],
		group: "group-1",
	});
	const g2Pro = products.base({
		id: "g2-pro",
		items: [wordsItem, proPrice],
		group: "group-2",
	});
	const g2Premium = products.base({
		id: "g2-premium",
		items: [wordsItem, premiumPrice],
		group: "group-2",
	});

	const { autumnV1 } = await initScenario({
		customerId,
		setup: [
			s.customer({ paymentMethod: "success" }),
			s.products({ list: [g1Pro, g2Pro, g1Premium, g2Premium] }),
		],
		actions: [s.attach({ productId: g1Premium.id })],
	});

	await autumnV1.attach({
		customer_id: customerId,
		product_id: g2Premium.id,
	});

	let customer = await autumnV1.customers.get<ApiCustomerV3>(customerId);
	expectProductAttached({
		customer: customer as any,
		productId: g1Premium.id,
		status: "active" as unknown as CusProductStatus,
	});
	expectProductAttached({
		customer: customer as any,
		productId: g2Premium.id,
		status: "active" as unknown as CusProductStatus,
	});

	await autumnV1.attach({
		customer_id: customerId,
		product_id: g1Pro.id,
	});

	customer = await autumnV1.customers.get<ApiCustomerV3>(customerId);
	expectProductAttached({
		customer: customer as any,
		productId: g1Premium.id,
		status: "active" as unknown as CusProductStatus,
	});
	expectProductAttached({
		customer: customer as any,
		productId: g2Premium.id,
		status: "active" as unknown as CusProductStatus,
	});
	expectProductAttached({
		customer: customer as any,
		productId: g1Pro.id,
		status: "scheduled" as unknown as CusProductStatus,
	});

	await expectSubToBeCorrect({
		db: ctx.db,
		customerId,
		org: ctx.org,
		env: ctx.env,
	});
});
