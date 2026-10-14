import { expect, test } from "bun:test";
import type { ApiCustomerV5 } from "@autumn/shared";
import {
	ApiVersion,
	type CustomerBillingControls,
	ResetInterval,
} from "@autumn/shared";
import { expectCustomerEventsCorrect } from "@tests/integration/balances/utils/events/expectCustomerEventsCorrect.js";
import { expectBalanceCorrect } from "@tests/integration/utils/expectBalanceCorrect.js";
import { expectUsageLimitCorrect } from "@tests/integration/utils/expectUsageLimitCorrect.js";
import { TestFeature } from "@tests/setup/v2Features.js";
import { items } from "@tests/utils/fixtures/items.js";
import { products } from "@tests/utils/fixtures/products.js";
import { timeout } from "@tests/utils/genUtils.js";
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
	`${chalk.yellowBright("usage-window-enforcement1: metered cap clamps the over-cap unit while credits remain")}`,
	async () => {
		const customerProduct = products.base({
			id: "uw-enforce-metered",
			items: [items.monthlyCredits({ includedUsage: 100 })],
		});

		const customerId = "uw-enforce-metered-1";
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
			featureId: TestFeature.Action1,
			limit: 5,
		});

		await autumnV2_3.track({
			customer_id: customerId,
			feature_id: TestFeature.Action1,
			value: 5,
		});
		await expectCustomerBalance({
			autumn: autumnV2_3,
			customerId,
			featureId: TestFeature.Credits,
			granted: 100,
			remaining: 99,
			usage: 1,
		});

		await autumnV2_3.track({
			customer_id: customerId,
			feature_id: TestFeature.Action1,
			value: 1,
		});
		await expectCustomerBalance({
			autumn: autumnV2_3,
			customerId,
			featureId: TestFeature.Credits,
			granted: 100,
			remaining: 99,
			usage: 1,
		});
		await expectCustomerUsageLimit({
			autumn: autumnV2_3,
			customerId,
			featureId: TestFeature.Action1,
			usage: 5,
			limit: 5,
		});
	},
);

test.concurrent(
	`${chalk.yellowBright("usage-window-enforcement2: over-cap track applies what fits (clamp, not reject)")}`,
	async () => {
		const customerProduct = products.base({
			id: "uw-enforce-clamp",
			items: [items.monthlyMessages({ includedUsage: 100 })],
		});

		const customerId = "uw-enforce-clamp-1";
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
			featureId: TestFeature.Messages,
			limit: 5,
		});

		const clamped = await autumnV2_3.track({
			customer_id: customerId,
			feature_id: TestFeature.Messages,
			value: 10,
		});
		expect(clamped.value).toBe(10);
		await expectCustomerBalance({
			autumn: autumnV2_3,
			customerId,
			featureId: TestFeature.Messages,
			remaining: 95,
			usage: 5,
		});

		await autumnV2_3.track({
			customer_id: customerId,
			feature_id: TestFeature.Messages,
			value: 3,
		});
		await expectCustomerBalance({
			autumn: autumnV2_3,
			customerId,
			featureId: TestFeature.Messages,
			remaining: 95,
			usage: 5,
		});
		await expectCustomerUsageLimit({
			autumn: autumnV2_3,
			customerId,
			featureId: TestFeature.Messages,
			usage: 5,
			limit: 5,
		});
	},
);

test.concurrent(
	`${chalk.yellowBright("usage-window-enforcement3: metered cap clamps across monthly then lifetime credits cusEnts")}`,
	async () => {
		const monthlyCreditsItem = items.monthlyCredits({ includedUsage: 1 });
		const lifetimeCreditsItem = constructFeatureItem({
			featureId: TestFeature.Credits,
			includedUsage: 10,
			interval: null,
		});
		const freePlan = products.base({
			id: "uw-enforce-metered-multi",
			items: [monthlyCreditsItem, lifetimeCreditsItem],
		});

		const customerId = "uw-enforce-metered-multi-1";
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
			limit: 10,
		});

		await autumnV2_3.track({
			customer_id: customerId,
			feature_id: TestFeature.Action1,
			value: 15,
		});

		const afterClamp =
			await autumnV2_3.customers.get<ApiCustomerV5>(customerId);
		expectBalanceCorrect({
			customer: afterClamp,
			featureId: TestFeature.Credits,
			granted: 11,
			remaining: 9,
			usage: 2,
			breakdown: {
				[ResetInterval.Month]: {
					included_grant: 1,
					remaining: 0,
					usage: 1,
				},
				[ResetInterval.OneOff]: {
					included_grant: 10,
					remaining: 9,
					usage: 1,
				},
			},
		});

		await autumnV2_3.track({
			customer_id: customerId,
			feature_id: TestFeature.Action1,
			value: 5,
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
		expectUsageLimitCorrect({
			customer: atCap,
			featureId: TestFeature.Action1,
			usage: 10,
			limit: 10,
		});
	},
);

test.concurrent(
	`${chalk.yellowBright("usage-window-enforcement4: balance cap (1 credit/day) clamps while monthly credits remain")}`,
	async () => {
		const customerProduct = products.base({
			id: "uw-enforce-balance",
			items: [items.monthlyCredits({ includedUsage: 100 })],
		});

		const customerId = "uw-enforce-balance-1";
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
			limit: 1,
			interval: ResetInterval.Day,
		});

		await autumnV2_3.track({
			customer_id: customerId,
			feature_id: TestFeature.Action1,
			value: 5,
		});
		await expectCustomerBalance({
			autumn: autumnV2_3,
			customerId,
			featureId: TestFeature.Credits,
			granted: 100,
			remaining: 99,
			usage: 1,
		});

		await autumnV2_3.track({
			customer_id: customerId,
			feature_id: TestFeature.Action1,
			value: 1,
		});
		await expectCustomerBalance({
			autumn: autumnV2_3,
			customerId,
			featureId: TestFeature.Credits,
			granted: 100,
			remaining: 99,
			usage: 1,
		});
		await expectCustomerUsageLimit({
			autumn: autumnV2_3,
			customerId,
			featureId: TestFeature.Credits,
			usage: 1,
			limit: 1,
		});
	},
);

test.concurrent(
	`${chalk.yellowBright("usage-window-enforcement5: balance cap counts drains across monthly and lifetime cusEnts")}`,
	async () => {
		const monthlyCreditsItem = items.monthlyCredits({ includedUsage: 1 });
		const lifetimeCreditsItem = constructFeatureItem({
			featureId: TestFeature.Credits,
			includedUsage: 10,
			interval: null,
		});
		const freePlan = products.base({
			id: "uw-enforce-balance-multi",
			items: [monthlyCreditsItem, lifetimeCreditsItem],
		});

		const customerId = "uw-enforce-balance-multi-1";
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
			feature_id: TestFeature.Action1,
			value: 10,
		});
		await expectCustomerBalance({
			autumn: autumnV2_3,
			customerId,
			featureId: TestFeature.Credits,
			granted: 11,
			remaining: 9,
			usage: 2,
		});

		await autumnV2_3.track({
			customer_id: customerId,
			feature_id: TestFeature.Action1,
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
	`${chalk.yellowBright("usage-window-enforcement6: a usage limit clamps alongside an overage spend_limit on the same feature")}`,
	async () => {
		const customerProduct = products.base({
			id: "uw-enforce-compound",
			items: [items.monthlyCredits({ includedUsage: 100 })],
		});

		const customerId = "uw-enforce-compound-1";
		await initScenario({
			customerId,
			setup: [
				s.customer({ testClock: false }),
				s.products({ list: [customerProduct] }),
			],
			actions: [s.billing.attach({ productId: customerProduct.id })],
		});

		const billingControls: CustomerBillingControls = {
			spend_limits: [
				{
					feature_id: TestFeature.Action1,
					enabled: true,
					overage_limit: 20,
				},
			],
			usage_limits: [
				{
					feature_id: TestFeature.Action1,
					enabled: true,
					limit: 5,
					interval: ResetInterval.Month,
				},
			],
		};
		await timeout(2000);
		await autumnV2_3.customers.update(customerId, {
			billing_controls: billingControls,
		});
		await timeout(3000);

		await autumnV2_3.track({
			customer_id: customerId,
			feature_id: TestFeature.Action1,
			value: 5,
		});

		await autumnV2_3.track({
			customer_id: customerId,
			feature_id: TestFeature.Action1,
			value: 1,
		});
		await expectCustomerBalance({
			autumn: autumnV2_3,
			customerId,
			featureId: TestFeature.Credits,
			remaining: 99,
			usage: 1,
		});
		await expectCustomerUsageLimit({
			autumn: autumnV2_3,
			customerId,
			featureId: TestFeature.Action1,
			usage: 5,
			limit: 5,
		});
	},
);

test.concurrent(
	`${chalk.yellowBright("usage-window-enforcement7: concurrent tracks on one window serialize, total clamped to the cap")}`,
	async () => {
		const customerProduct = products.base({
			id: "uw-enforce-concurrent",
			items: [items.monthlyCredits({ includedUsage: 100 })],
		});

		const customerId = `uw-enforce-concurrent-${Date.now()}`;
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
			featureId: TestFeature.Action1,
			limit: 5,
		});

		const results = await Promise.allSettled([
			autumnV2_3.track({
				customer_id: customerId,
				feature_id: TestFeature.Action1,
				value: 5,
			}),
			autumnV2_3.track({
				customer_id: customerId,
				feature_id: TestFeature.Action1,
				value: 5,
			}),
		]);

		expect(results.every((result) => result.status === "fulfilled")).toBe(true);

		await timeout(2000);
		await expectCustomerBalance({
			autumn: autumnV2_3,
			customerId,
			featureId: TestFeature.Credits,
			remaining: 99,
			usage: 1,
		});
		await expectCustomerUsageLimit({
			autumn: autumnV2_3,
			customerId,
			featureId: TestFeature.Action1,
			usage: 5,
			limit: 5,
		});

		await expectCustomerEventsCorrect({
			customerId,
			events: [{ value: 5 }, { value: 5 }],
		});
	},
);

test.concurrent(
	`${chalk.yellowBright("usage-window-enforcement8: metered cap counts units across native and credit-system cusEnts")}`,
	async () => {
		const action1Item = items.free({
			featureId: TestFeature.Action1,
			includedUsage: 5,
		});
		const creditsItem = items.monthlyCredits({ includedUsage: 100 });
		const freePlan = products.base({
			id: "uw-enforce-mixed",
			items: [action1Item, creditsItem],
		});

		const customerId = "uw-enforce-mixed-1";
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
			limit: 8,
		});

		await autumnV2_3.track({
			customer_id: customerId,
			feature_id: TestFeature.Action1,
			value: 10,
		});
		await expectCustomerBalance({
			autumn: autumnV2_3,
			customerId,
			featureId: TestFeature.Action1,
			granted: 5,
			remaining: 0,
			usage: 5,
		});
		await expectCustomerBalance({
			autumn: autumnV2_3,
			customerId,
			featureId: TestFeature.Credits,
			granted: 100,
			remaining: 99.4,
			usage: 0.6,
		});

		await autumnV2_3.track({
			customer_id: customerId,
			feature_id: TestFeature.Action1,
			value: 1,
		});
		const atCap = await autumnV2_3.customers.get<ApiCustomerV5>(customerId);
		expectBalanceCorrect({
			customer: atCap,
			featureId: TestFeature.Credits,
			remaining: 99.4,
			usage: 0.6,
		});

		expectUsageLimitCorrect({
			customer: atCap,
			featureId: TestFeature.Action1,
			usage: 8,
			limit: 8,
		});
	},
);

test.concurrent(
	`${chalk.yellowBright("usage-window-enforcement9: an action1 cap does not touch direct credits tracking")}`,
	async () => {
		const customerProduct = products.base({
			id: "uw-enforce-scope",
			items: [items.monthlyCredits({ includedUsage: 100 })],
		});

		const customerId = "uw-enforce-scope-1";
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
			featureId: TestFeature.Action1,
			limit: 5,
		});

		await autumnV2_3.track({
			customer_id: customerId,
			feature_id: TestFeature.Action1,
			value: 5,
		});

		await autumnV2_3.track({
			customer_id: customerId,
			feature_id: TestFeature.Credits,
			value: 10,
		});
		await expectCustomerBalance({
			autumn: autumnV2_3,
			customerId,
			featureId: TestFeature.Credits,
			granted: 100,
			remaining: 89,
			usage: 11,
		});

		await expectCustomerUsageLimit({
			autumn: autumnV2_3,
			customerId,
			featureId: TestFeature.Action1,
			usage: 5,
			limit: 5,
		});
	},
);
