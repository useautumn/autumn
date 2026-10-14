import { test } from "bun:test";
import type { ApiCustomerV5 } from "@autumn/shared";
import { ApiVersion, ResetInterval } from "@autumn/shared";
import { expectBalanceCorrect } from "@tests/integration/utils/expectBalanceCorrect.js";
import { expectUsageLimitCorrect } from "@tests/integration/utils/expectUsageLimitCorrect.js";
import { TestFeature } from "@tests/setup/v2Features.js";
import { items } from "@tests/utils/fixtures/items.js";
import { products } from "@tests/utils/fixtures/products.js";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario.js";
import chalk from "chalk";
import { AutumnInt } from "@/external/autumn/autumnCli.js";
import { constructFeatureItem } from "@/utils/scriptUtils/constructItem.js";
import {
	expectCustomerBalance,
	expectCustomerUsageLimit,
	setCustomerUsageLimit,
} from "../utils/usage-limit-utils/customerUsageLimitUtils.js";

const autumnV2_3 = new AutumnInt({ version: ApiVersion.V2_3 });

test.concurrent(
	`${chalk.yellowBright("usage-window-own-feature1: cap on the tracked feature itself clamps at the cap")}`,
	async () => {
		const customerProduct = products.base({
			id: "uw-own-same-interval",
			items: [items.monthlyCredits({ includedUsage: 100 })],
		});

		const customerId = "uw-own-same-interval-1";
		await initScenario({
			customerId,
			setup: [
				s.customer({ testClock: false }),
				s.products({ list: [customerProduct] }),
			],
			actions: [s.billing.attach({ productId: customerProduct.id })],
		});

		await setCustomerUsageLimit({
			autumn: autumnV2_3,
			customerId,
			featureId: TestFeature.Credits,
			limit: 5,
		});

		await autumnV2_3.track({
			customer_id: customerId,
			feature_id: TestFeature.Credits,
			value: 5,
		});
		await expectCustomerBalance({
			autumn: autumnV2_3,
			customerId,
			featureId: TestFeature.Credits,
			granted: 100,
			remaining: 95,
			usage: 5,
		});

		await autumnV2_3.track({
			customer_id: customerId,
			feature_id: TestFeature.Credits,
			value: 1,
		});
		await expectCustomerBalance({
			autumn: autumnV2_3,
			customerId,
			featureId: TestFeature.Credits,
			granted: 100,
			remaining: 95,
			usage: 5,
		});
		await expectCustomerUsageLimit({
			autumn: autumnV2_3,
			customerId,
			featureId: TestFeature.Credits,
			usage: 5,
			limit: 5,
		});
	},
);

test.concurrent(
	`${chalk.yellowBright("usage-window-own-feature2: daily cap on a monthly cusEnt clamps while balance remains")}`,
	async () => {
		const customerProduct = products.base({
			id: "uw-own-day-cap",
			items: [items.monthlyCredits({ includedUsage: 100 })],
		});

		const customerId = "uw-own-day-cap-1";
		await initScenario({
			customerId,
			setup: [
				s.customer({ testClock: false }),
				s.products({ list: [customerProduct] }),
			],
			actions: [s.billing.attach({ productId: customerProduct.id })],
		});

		await setCustomerUsageLimit({
			autumn: autumnV2_3,
			customerId,
			featureId: TestFeature.Credits,
			limit: 2,
			interval: ResetInterval.Day,
		});

		await autumnV2_3.track({
			customer_id: customerId,
			feature_id: TestFeature.Credits,
			value: 2,
		});

		await autumnV2_3.track({
			customer_id: customerId,
			feature_id: TestFeature.Credits,
			value: 1,
		});
		await expectCustomerBalance({
			autumn: autumnV2_3,
			customerId,
			featureId: TestFeature.Credits,
			granted: 100,
			remaining: 98,
			usage: 2,
		});
		await expectCustomerUsageLimit({
			autumn: autumnV2_3,
			customerId,
			featureId: TestFeature.Credits,
			usage: 2,
			limit: 2,
		});
	},
);

test.concurrent(
	`${chalk.yellowBright("usage-window-own-feature3: direct track across two cusEnts aggregates onto one counter")}`,
	async () => {
		const monthlyCreditsItem = items.monthlyCredits({ includedUsage: 1 });
		const lifetimeCreditsItem = constructFeatureItem({
			featureId: TestFeature.Credits,
			includedUsage: 10,
			interval: null,
		});
		const freePlan = products.base({
			id: "uw-own-multi-credit",
			items: [monthlyCreditsItem, lifetimeCreditsItem],
		});

		const customerId = "uw-own-multi-credit-1";
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
			featureId: TestFeature.Credits,
			limit: 2,
			interval: ResetInterval.Day,
		});

		await autumnV2_3.track({
			customer_id: customerId,
			feature_id: TestFeature.Credits,
			value: 2,
		});
		const atCap = await autumnV2_3.customers.get<ApiCustomerV5>(customerId);
		expectBalanceCorrect({
			customer: atCap,
			featureId: TestFeature.Credits,
			granted: 11,
			remaining: 9,
			usage: 2,
			breakdown: {
				[ResetInterval.Month]: { remaining: 0, usage: 1 },
				[ResetInterval.OneOff]: { remaining: 9, usage: 1 },
			},
		});

		await autumnV2_3.track({
			customer_id: customerId,
			feature_id: TestFeature.Credits,
			value: 1,
		});
		const afterClamp =
			await autumnV2_3.customers.get<ApiCustomerV5>(customerId);
		expectBalanceCorrect({
			customer: afterClamp,
			featureId: TestFeature.Credits,
			granted: 11,
			remaining: 9,
			usage: 2,
		});

		expectUsageLimitCorrect({
			customer: afterClamp,
			featureId: TestFeature.Credits,
			usage: 2,
			limit: 2,
		});
	},
);

test.concurrent(
	`${chalk.yellowBright("usage-window-own-feature4: metered cap aggregates across two cusEnts and clamps to headroom")}`,
	async () => {
		const monthlyMessagesItem = items.monthlyMessages({ includedUsage: 100 });
		const lifetimeMessagesItem = items.lifetimeMessages({
			includedUsage: 100,
		});
		const freePlan = products.base({
			id: "uw-own-multi-messages",
			items: [monthlyMessagesItem, lifetimeMessagesItem],
		});

		const customerId = "uw-own-multi-messages-1";
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
			limit: 150,
		});

		await autumnV2_3.track({
			customer_id: customerId,
			feature_id: TestFeature.Messages,
			value: 120,
		});
		const afterSpan = await autumnV2_3.customers.get<ApiCustomerV5>(customerId);
		expectBalanceCorrect({
			customer: afterSpan,
			featureId: TestFeature.Messages,
			granted: 200,
			remaining: 80,
			usage: 120,
			breakdown: {
				[ResetInterval.Month]: { remaining: 0, usage: 100 },
				[ResetInterval.OneOff]: { remaining: 80, usage: 20 },
			},
		});

		await autumnV2_3.track({
			customer_id: customerId,
			feature_id: TestFeature.Messages,
			value: 50,
		});
		const atCap = await autumnV2_3.customers.get<ApiCustomerV5>(customerId);
		expectBalanceCorrect({
			customer: atCap,
			featureId: TestFeature.Messages,
			granted: 200,
			remaining: 50,
			usage: 150,
			breakdown: {
				[ResetInterval.Month]: { remaining: 0, usage: 100 },
				[ResetInterval.OneOff]: { remaining: 50, usage: 50 },
			},
		});

		expectUsageLimitCorrect({
			customer: atCap,
			featureId: TestFeature.Messages,
			usage: 150,
			limit: 150,
		});
	},
);
