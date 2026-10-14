import { expect, test } from "bun:test";
import type {
	ApiCustomer,
	CheckResponseV2,
	TrackResponseV2,
} from "@autumn/shared";
import { findCustomerEntitlement } from "@tests/balances/utils/findCustomerEntitlement.js";
import { TestFeature } from "@tests/setup/v2Features.js";
import { expireCusEntForReset } from "@tests/utils/cusProductUtils/resetTestUtils.js";
import { items } from "@tests/utils/fixtures/items.js";
import { products } from "@tests/utils/fixtures/products.js";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario.js";
import chalk from "chalk";

test.concurrent(`${chalk.yellowBright("lazy reset (DB): GET customer resets balance after next_reset_at passes")}`, async () => {
	const messagesItem = items.monthlyMessages({ includedUsage: 100 });
	const pro = products.pro({ items: [messagesItem] });

	const { customerId, autumnV1, autumnV2, ctx } = await initScenario({
		customerId: "reset-get-db",
		setup: [
			s.customer({ paymentMethod: "success", testClock: false }),
			s.products({ list: [pro] }),
		],
		actions: [s.attach({ productId: pro.id })],
	});

	await autumnV1.track({
		customer_id: customerId,
		feature_id: TestFeature.Messages,
		value: 30,
	});
	await new Promise((resolve) => setTimeout(resolve, 2000));

	const before = await autumnV2.customers.get<ApiCustomer>(customerId, {
		skip_cache: "true",
	});
	expect(before.balances[TestFeature.Messages].current_balance).toBe(70);
	expect(before.balances[TestFeature.Messages].usage).toBe(30);

	await expireCusEntForReset({
		ctx,
		customerId,
		featureId: TestFeature.Messages,
	});

	const after = await autumnV2.customers.get<ApiCustomer>(customerId, {
		skip_cache: "true",
	});
	expect(after.balances[TestFeature.Messages].current_balance).toBe(100);
	expect(after.balances[TestFeature.Messages].usage).toBe(0);

	const cusEntAfter = await findCustomerEntitlement({
		ctx,
		customerId,
		featureId: TestFeature.Messages,
	});
	expect(cusEntAfter).toBeDefined();
	expect(cusEntAfter!.next_reset_at).toBeGreaterThan(Date.now());
});

test.concurrent(`${chalk.yellowBright("lazy reset (cache): GET customer resets balance from cache after next_reset_at passes")}`, async () => {
	const messagesItem = items.monthlyMessages({ includedUsage: 100 });
	const pro = products.pro({ items: [messagesItem] });

	const { customerId, autumnV1, autumnV2, ctx } = await initScenario({
		customerId: "reset-get-cache",
		setup: [
			s.customer({ paymentMethod: "success", testClock: false }),
			s.products({ list: [pro] }),
		],
		actions: [s.attach({ productId: pro.id })],
	});

	await autumnV1.track({
		customer_id: customerId,
		feature_id: TestFeature.Messages,
		value: 30,
	});
	await new Promise((resolve) => setTimeout(resolve, 2000));

	const before = await autumnV2.customers.get<ApiCustomer>(customerId);
	expect(before.balances[TestFeature.Messages].current_balance).toBe(70);

	await expireCusEntForReset({
		ctx,
		customerId,
		featureId: TestFeature.Messages,
	});

	const after = await autumnV2.customers.get<ApiCustomer>(customerId);
	expect(after.balances[TestFeature.Messages].current_balance).toBe(100);
	expect(after.balances[TestFeature.Messages].usage).toBe(0);

	const cusEntAfter = await findCustomerEntitlement({
		ctx,
		customerId,
		featureId: TestFeature.Messages,
	});
	expect(cusEntAfter).toBeDefined();
	expect(cusEntAfter!.next_reset_at).toBeGreaterThan(Date.now());
});

test.concurrent(`${chalk.yellowBright("lazy reset: check returns reset balance after next_reset_at passes")}`, async () => {
	const messagesItem = items.monthlyMessages({ includedUsage: 100 });
	const pro = products.pro({ items: [messagesItem] });

	const { customerId, autumnV1, autumnV2, ctx } = await initScenario({
		customerId: "reset-check",
		setup: [
			s.customer({ paymentMethod: "success", testClock: false }),
			s.products({ list: [pro] }),
		],
		actions: [s.attach({ productId: pro.id })],
	});

	await autumnV1.track({
		customer_id: customerId,
		feature_id: TestFeature.Messages,
		value: 60,
	});
	await new Promise((resolve) => setTimeout(resolve, 2000));

	const checkBefore = (await autumnV2.check({
		customer_id: customerId,
		feature_id: TestFeature.Messages,
	})) as unknown as CheckResponseV2;
	expect(checkBefore.allowed).toBe(true);
	expect(checkBefore.balance?.current_balance).toBe(40);
	expect(checkBefore.balance?.usage).toBe(60);

	await expireCusEntForReset({
		ctx,
		customerId,
		featureId: TestFeature.Messages,
	});

	const checkAfter = (await autumnV2.check({
		customer_id: customerId,
		feature_id: TestFeature.Messages,
	})) as unknown as CheckResponseV2;
	expect(checkAfter.allowed).toBe(true);
	expect(checkAfter.balance?.current_balance).toBe(100);
	expect(checkAfter.balance?.usage).toBe(0);
});

test.concurrent(`${chalk.yellowBright("lazy reset: track resets balance then deducts correctly")}`, async () => {
	const messagesItem = items.monthlyMessages({ includedUsage: 100 });
	const pro = products.pro({ items: [messagesItem] });

	const { customerId, autumnV1, autumnV2, ctx } = await initScenario({
		customerId: "reset-track",
		setup: [
			s.customer({ paymentMethod: "success", testClock: false }),
			s.products({ list: [pro] }),
		],
		actions: [s.attach({ productId: pro.id })],
	});

	await autumnV1.track({
		customer_id: customerId,
		feature_id: TestFeature.Messages,
		value: 50,
	});
	await new Promise((resolve) => setTimeout(resolve, 2000));

	await expireCusEntForReset({
		ctx,
		customerId,
		featureId: TestFeature.Messages,
	});

	const trackRes: TrackResponseV2 = await autumnV2.track({
		customer_id: customerId,
		feature_id: TestFeature.Messages,
		value: 20,
	});
	expect(trackRes.balance?.current_balance).toBe(80);
	expect(trackRes.balance?.usage).toBe(20);

	const customer = await autumnV2.customers.get<ApiCustomer>(customerId);
	expect(customer.balances[TestFeature.Messages].current_balance).toBe(80);
	expect(customer.balances[TestFeature.Messages].usage).toBe(20);

	await new Promise((resolve) => setTimeout(resolve, 2000));

	const customerDb = await autumnV2.customers.get<ApiCustomer>(customerId, {
		skip_cache: "true",
	});
	expect(customerDb.balances[TestFeature.Messages].current_balance).toBe(80);
	expect(customerDb.balances[TestFeature.Messages].usage).toBe(20);

	const cusEntAfter = await findCustomerEntitlement({
		ctx,
		customerId,
		featureId: TestFeature.Messages,
	});
	expect(cusEntAfter).toBeDefined();
	expect(cusEntAfter!.next_reset_at).toBeGreaterThan(Date.now());
});

test.concurrent(`${chalk.yellowBright("lazy reset: POST /check on existing customer triggers reset")}`, async () => {
	const messagesItem = items.monthlyMessages({ includedUsage: 100 });
	const pro = products.pro({ items: [messagesItem] });

	const { customerId, autumnV1, autumnV2, ctx } = await initScenario({
		customerId: "reset-post-check",
		setup: [
			s.customer({ paymentMethod: "success", testClock: false }),
			s.products({ list: [pro] }),
		],
		actions: [s.attach({ productId: pro.id })],
	});

	await autumnV1.track({
		customer_id: customerId,
		feature_id: TestFeature.Messages,
		value: 40,
	});
	await new Promise((resolve) => setTimeout(resolve, 2000));

	await expireCusEntForReset({
		ctx,
		customerId,
		featureId: TestFeature.Messages,
	});

	const checkRes = (await autumnV2.check({
		customer_id: customerId,
		feature_id: TestFeature.Messages,
		required_balance: 90,
	})) as unknown as CheckResponseV2;

	expect(checkRes.allowed).toBe(true);
	expect(checkRes.balance?.current_balance).toBe(100);
	expect(checkRes.balance?.usage).toBe(0);
});
