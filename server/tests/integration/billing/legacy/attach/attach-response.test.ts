/** biome-ignore-all lint/suspicious/noExplicitAny: test file */

import { expect, test } from "bun:test";
import { ApiVersion } from "@autumn/shared";
import { items } from "@tests/utils/fixtures/items";
import { products } from "@tests/utils/fixtures/products";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario";
import chalk from "chalk";
import { AutumnInt } from "@/external/autumn/autumnCli";

test.concurrent(`${chalk.yellowBright("attach-response 1: new attach, no card → checkout_url")}`, async () => {
	const customerId = "attach-response-1";

	const pro = products.pro({
		id: "pro",
		items: [items.consumableWords({ includedUsage: 1000 })],
	});

	await initScenario({
		customerId,
		setup: [s.customer({}), s.products({ list: [pro] })],
		actions: [],
	});

	const autumnV0 = new AutumnInt({ version: ApiVersion.V0_2 });
	const autumnV1 = new AutumnInt({ version: ApiVersion.V1_2 });

	const v0Response = await autumnV0.attach({
		customer_id: customerId,
		product_id: pro.id,
	});

	expect(v0Response.checkout_url).toBeDefined();
	expect(Object.keys(v0Response)).toEqual(["checkout_url"]);

	const v1Response = await autumnV1.attach({
		customer_id: customerId,
		product_id: pro.id,
	});

	expect(v1Response).toMatchObject({
		customer_id: customerId,
		product_ids: [pro.id],
		checkout_url: expect.any(String),
	});
	expect(v1Response.code).toBeDefined();
	expect(v1Response.message).toBeDefined();
});

test.concurrent(`${chalk.yellowBright("attach-response 2: upgrade response")}`, async () => {
	const customerId1 = "attach-response-2-1";
	const customerId2 = "attach-response-2-2";

	const wordsItem = items.monthlyWords({ includedUsage: 1000 });
	const pro = products.pro({ id: "pro", items: [wordsItem] });
	const premium = products.premium({ id: "premium", items: [wordsItem] });

	const { autumnV1 } = await initScenario({
		customerId: customerId1,
		setup: [
			s.customer({ paymentMethod: "success", testClock: true }),
			s.products({ list: [pro, premium] }),
			s.otherCustomers([{ id: customerId2, paymentMethod: "success" }]),
		],
		actions: [s.attach({ productId: pro.id })],
	});

	const autumnV0 = new AutumnInt({ version: ApiVersion.V0_2 });

	const v0Response = await autumnV0.attach({
		customer_id: customerId1,
		product_id: premium.id,
	});

	expect(Object.keys(v0Response)).toEqual(["success", "message"]);

	await autumnV1.attach({
		customer_id: customerId2,
		product_id: pro.id,
	});

	const v1Response = await autumnV1.attach({
		customer_id: customerId2,
		product_id: premium.id,
	});

	expect(v1Response).toMatchObject({
		customer_id: customerId2,
		product_ids: [premium.id],
		code: expect.any(String),
		message: expect.any(String),
	});
});

test.concurrent(`${chalk.yellowBright("attach-response 3: downgrade response")}`, async () => {
	const customerId = "attach-response-3";

	const wordsItem = items.monthlyWords({ includedUsage: 1000 });
	const pro = products.pro({ id: "pro", items: [wordsItem] });
	const premium = products.premium({ id: "premium", items: [wordsItem] });

	const { autumnV1 } = await initScenario({
		customerId,
		setup: [
			s.customer({ paymentMethod: "success", testClock: true }),
			s.products({ list: [pro, premium] }),
		],
		actions: [s.attach({ productId: premium.id })],
	});

	const autumnV0 = new AutumnInt({ version: ApiVersion.V0_2 });

	const v0Response = await autumnV0.attach({
		customer_id: customerId,
		product_id: pro.id,
	});

	expect(Object.keys(v0Response)).toEqual(["success", "message"]);

	await autumnV1.subscriptions.update({
		customer_id: customerId,
		product_id: premium.id,
		cancel_action: "uncancel",
	});

	const v1Response = await autumnV1.attach({
		customer_id: customerId,
		product_id: pro.id,
	});

	expect(v1Response).toMatchObject({
		customer_id: customerId,
		product_ids: [pro.id],
		code: expect.any(String),
		message: expect.any(String),
	});
});

test.concurrent(`${chalk.yellowBright("attach-response 4: new attach, card on file")}`, async () => {
	const customerId = "attach-response-4";

	const pro = products.pro({
		id: "pro",
		items: [items.monthlyWords({ includedUsage: 1000 })],
	});

	const { autumnV1 } = await initScenario({
		customerId,
		setup: [
			s.customer({ paymentMethod: "success", testClock: true }),
			s.products({ list: [pro] }),
		],
		actions: [],
	});

	const autumnV0 = new AutumnInt({ version: ApiVersion.V0_2 });

	const v0Response = await autumnV0.attach({
		customer_id: customerId,
		product_id: pro.id,
	});

	expect(Object.keys(v0Response)).toEqual(["success", "message"]);

	await autumnV1.cancel({
		customer_id: customerId,
		product_id: pro.id,
		cancel_immediately: true,
	});

	const v1Response = await autumnV1.attach({
		customer_id: customerId,
		product_id: pro.id,
	});

	expect(v1Response).toMatchObject({
		customer_id: customerId,
		product_ids: [pro.id],
		code: expect.any(String),
		message: expect.any(String),
	});
});

test.concurrent(`${chalk.yellowBright("attach-response 5: one-off attach, card on file")}`, async () => {
	const customerId = "attach-response-5";

	const oneOff = products.oneOff({
		id: "one-off",
		items: [items.lifetimeMessages({ includedUsage: 1000 })],
	});

	await initScenario({
		customerId,
		setup: [
			s.customer({ paymentMethod: "success", testClock: true }),
			s.products({ list: [oneOff] }),
		],
		actions: [],
	});

	const autumnV0 = new AutumnInt({ version: ApiVersion.V0_2 });
	const autumnV1 = new AutumnInt({ version: ApiVersion.V1_2 });

	const v0Response = await autumnV0.attach({
		customer_id: customerId,
		product_id: oneOff.id,
	});

	expect(v0Response).toMatchObject({
		success: true,
		message: expect.any(String),
	});

	const v1Response = await autumnV1.attach({
		customer_id: customerId,
		product_id: oneOff.id,
	});

	expect(v1Response).toMatchObject({
		success: true,
		customer_id: customerId,
		product_ids: [oneOff.id],
		code: expect.any(String),
		message: expect.any(String),
	});
});
