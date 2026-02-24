import { expect, test } from "bun:test";
import {
	ApiVersion,
	type CheckResponseV2,
	ResetInterval,
} from "@autumn/shared";
import { TestFeature } from "@tests/setup/v2Features.js";
import { items } from "@tests/utils/fixtures/items.js";
import { products } from "@tests/utils/fixtures/products.js";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario.js";
import chalk from "chalk";
import { AutumnInt } from "@/external/autumn/autumnCli.js";

function sleepUntil(epochMs: number): Promise<void> {
	const delay = epochMs - Date.now();
	if (delay <= 0) return Promise.resolve();
	return new Promise((resolve) => setTimeout(resolve, delay));
}

const testCase = "check-loose-expiry";

test.concurrent(chalk.yellowBright(`${testCase}-basic: expiring loose entitlement should be allowed before expiry, then denied after`), async () => {
	const customerId = `${testCase}-basic`;
	const messagesItem = items.monthlyMessages({ includedUsage: 100 });
	const freeProd = products.base({ id: "free", items: [messagesItem] });

	const { ctx } = await initScenario({
		customerId,
		setup: [s.customer({ testClock: false }), s.products({ list: [freeProd] })],
		actions: [],
	});

	const autumnV1 = new AutumnInt({
		version: ApiVersion.V1_2,
		secretKey: ctx.orgSecretKey,
	});
	const autumnV2 = new AutumnInt({
		version: ApiVersion.V2_0,
		secretKey: ctx.orgSecretKey,
	});

	const expiresAt = Date.now() + 3000;

	await autumnV1.balances.create({
		customer_id: customerId,
		feature_id: TestFeature.Messages,
		granted_balance: 500,
		expires_at: expiresAt,
	});

	const resBefore = (await autumnV2.check({
		customer_id: customerId,
		feature_id: TestFeature.Messages,
	})) as unknown as CheckResponseV2;

	expect(resBefore).toMatchObject({
		allowed: true,
		customer_id: customerId,
		balance: {
			plan_id: null,
			feature_id: TestFeature.Messages,
			granted_balance: 500,
			current_balance: 500,
			usage: 0,
			unlimited: false,
		},
	});

	await sleepUntil(expiresAt + 1000);

	const resAfter = (await autumnV2.check({
		customer_id: customerId,
		feature_id: TestFeature.Messages,
	})) as unknown as CheckResponseV2;

	expect(resAfter).toMatchObject({
		allowed: false,
		balance: null,
	});
});

test.concurrent(chalk.yellowBright(`${testCase}-product-mix: should combine product and expiring loose ent, then only product after expiry`), async () => {
	const customerId = `${testCase}-product-mix`;
	const messagesItem = items.monthlyMessages({ includedUsage: 100 });
	const freeProd = products.base({ id: "free", items: [messagesItem] });

	const { autumnV1, ctx } = await initScenario({
		customerId,
		setup: [s.customer({ testClock: false }), s.products({ list: [freeProd] })],
		actions: [s.attach({ productId: freeProd.id })],
	});

	const autumnV2 = new AutumnInt({
		version: ApiVersion.V2_0,
		secretKey: ctx.orgSecretKey,
	});

	const expiresAt = Date.now() + 3000;

	await autumnV1.balances.create({
		customer_id: customerId,
		feature_id: TestFeature.Messages,
		granted_balance: 200,
		expires_at: expiresAt,
	});

	const resBefore = (await autumnV2.check({
		customer_id: customerId,
		feature_id: TestFeature.Messages,
	})) as unknown as CheckResponseV2;

	expect(resBefore).toMatchObject({
		allowed: true,
		balance: {
			granted_balance: 300, // 100 from product + 200 from loose
			current_balance: 300,
		},
	});

	await sleepUntil(expiresAt + 1000);

	const resAfter = (await autumnV2.check({
		customer_id: customerId,
		feature_id: TestFeature.Messages,
	})) as unknown as CheckResponseV2;

	expect(resAfter).toMatchObject({
		allowed: true,
		balance: {
			granted_balance: 100, // Only product balance remains
			current_balance: 100,
		},
	});
});

test.concurrent(chalk.yellowBright(`${testCase}-reset-mix: should combine expiring and resetting loose ents, then only resetting after expiry`), async () => {
	const customerId = `${testCase}-reset-mix`;
	const messagesItem = items.monthlyMessages({ includedUsage: 100 });
	const freeProd = products.base({ id: "free", items: [messagesItem] });

	const { autumnV1, ctx } = await initScenario({
		customerId,
		setup: [s.customer({ testClock: false }), s.products({ list: [freeProd] })],
		actions: [],
	});

	const autumnV2 = new AutumnInt({
		version: ApiVersion.V2_0,
		secretKey: ctx.orgSecretKey,
	});

	const expiresAt = Date.now() + 3000;

	await autumnV1.balances.create({
		customer_id: customerId,
		feature_id: TestFeature.Messages,
		granted_balance: 200,
		expires_at: expiresAt,
	});

	await autumnV1.balances.create({
		customer_id: customerId,
		feature_id: TestFeature.Messages,
		granted_balance: 100,
		reset: {
			interval: ResetInterval.Month,
		},
	});

	const resBefore = (await autumnV2.check({
		customer_id: customerId,
		feature_id: TestFeature.Messages,
	})) as unknown as CheckResponseV2;

	expect(resBefore).toMatchObject({
		allowed: true,
		balance: {
			granted_balance: 300, // 200 expiring + 100 resetting
			current_balance: 300,
		},
	});

	await sleepUntil(expiresAt + 1000);

	const resAfter = (await autumnV2.check({
		customer_id: customerId,
		feature_id: TestFeature.Messages,
	})) as unknown as CheckResponseV2;

	expect(resAfter).toMatchObject({
		allowed: true,
		balance: {
			granted_balance: 100, // Only resetting balance remains
			current_balance: 100,
			reset: {
				interval: ResetInterval.Month,
			},
		},
	});
});
