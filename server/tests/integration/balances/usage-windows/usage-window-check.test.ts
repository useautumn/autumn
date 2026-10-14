import { expect, test } from "bun:test";
import { ApiVersion } from "@autumn/shared";
import { TestFeature } from "@tests/setup/v2Features.js";
import { items } from "@tests/utils/fixtures/items.js";
import { products } from "@tests/utils/fixtures/products.js";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario.js";
import chalk from "chalk";
import { AutumnInt } from "@/external/autumn/autumnCli.js";
import {
	expectCustomerBalance,
	setCustomerUsageLimit,
} from "../utils/usage-limit-utils/customerUsageLimitUtils.js";

const autumnV2_3 = new AutumnInt({ version: ApiVersion.V2_3 });

test.concurrent(
	`${chalk.yellowBright("usage-window-check1: pure check respects window headroom (metered cap)")}`,
	async () => {
		const freePlan = products.base({
			id: "uw-check-pure",
			items: [items.monthlyMessages({ includedUsage: 100 })],
		});

		const customerId = "uw-check-pure-1";
		await initScenario({
			customerId,
			setup: [
				s.customer({ testClock: false }),
				s.products({ list: [freePlan] }),
			],
			actions: [s.billing.attach({ productId: freePlan.id })],
		});

		await setCustomerUsageLimit({
			autumn: autumnV2_3,
			customerId,
			featureId: TestFeature.Messages,
			limit: 5,
		});

		await autumnV2_3.track({
			customer_id: customerId,
			feature_id: TestFeature.Messages,
			value: 3,
		});

		const within = await autumnV2_3.check({
			customer_id: customerId,
			feature_id: TestFeature.Messages,
			required_balance: 2,
		});
		expect(within.allowed).toBe(true);

		const beyond = await autumnV2_3.check({
			customer_id: customerId,
			feature_id: TestFeature.Messages,
			required_balance: 3,
		});
		expect(beyond.allowed).toBe(false);

		await expectCustomerBalance({
			autumn: autumnV2_3,
			customerId,
			featureId: TestFeature.Messages,
			remaining: 97,
			usage: 3,
		});
	},
);

test.concurrent(
	`${chalk.yellowBright("usage-window-check2: pure check converts a metered cap on a credit-funded feature")}`,
	async () => {
		const freePlan = products.base({
			id: "uw-check-convert",
			items: [items.monthlyCredits({ includedUsage: 100 })],
		});

		const customerId = "uw-check-convert-1";
		await initScenario({
			customerId,
			setup: [
				s.customer({ testClock: false }),
				s.products({ list: [freePlan] }),
			],
			actions: [s.billing.attach({ productId: freePlan.id })],
		});

		await setCustomerUsageLimit({
			autumn: autumnV2_3,
			customerId,
			featureId: TestFeature.Action1,
			limit: 5,
		});

		await autumnV2_3.track({
			customer_id: customerId,
			feature_id: TestFeature.Action1,
			value: 3,
		});

		const within = await autumnV2_3.check({
			customer_id: customerId,
			feature_id: TestFeature.Action1,
			required_balance: 2,
		});
		expect(within.allowed).toBe(true);

		const beyond = await autumnV2_3.check({
			customer_id: customerId,
			feature_id: TestFeature.Action1,
			required_balance: 3,
		});
		expect(beyond.allowed).toBe(false);
	},
);

test.concurrent(
	`${chalk.yellowBright("usage-window-check6: an exhausted action1 cap does not gate a credits check")}`,
	async () => {
		const freePlan = products.base({
			id: "uw-check-scope",
			items: [items.monthlyCredits({ includedUsage: 100 })],
		});

		const customerId = "uw-check-scope-1";
		await initScenario({
			customerId,
			setup: [
				s.customer({ testClock: false }),
				s.products({ list: [freePlan] }),
			],
			actions: [s.billing.attach({ productId: freePlan.id })],
		});

		await setCustomerUsageLimit({
			autumn: autumnV2_3,
			customerId,
			featureId: TestFeature.Action1,
			limit: 5,
		});

		await autumnV2_3.track({
			customer_id: customerId,
			feature_id: TestFeature.Action1,
			value: 5,
		});

		const action1Check = await autumnV2_3.check({
			customer_id: customerId,
			feature_id: TestFeature.Action1,
			required_balance: 1,
		});
		expect(action1Check.allowed).toBe(false);

		const creditsCheck = await autumnV2_3.check({
			customer_id: customerId,
			feature_id: TestFeature.Credits,
			required_balance: 50,
		});
		expect(creditsCheck.allowed).toBe(true);
	},
);
