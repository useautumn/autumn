import { expect, test } from "bun:test";
import {
	type ApiBalanceBreakdown,
	ApiVersion,
	type CheckResponseV0,
	type CheckResponseV1,
	type CheckResponseV2,
	EntInterval,
	type LimitedItem,
	ResetInterval,
	SuccessCode,
} from "@autumn/shared";
import { TestFeature } from "@tests/setup/v2Features.js";
import { items } from "@tests/utils/fixtures/items.js";
import { products } from "@tests/utils/fixtures/products.js";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario.js";
import chalk from "chalk";
import { AutumnInt } from "@/external/autumn/autumnCli.js";
import {
	constructArrearItem,
	constructFeatureItem,
} from "@/utils/scriptUtils/constructItem.js";

// ═══════════════════════════════════════════════════════════════════
// CHECK: No feature attached
// ═══════════════════════════════════════════════════════════════════

test.concurrent(`${chalk.yellowBright("check-no-feature: /check when no feature attached")}`, async () => {
	const dashboardItem = items.dashboard();
	const messagesItem = items.monthlyMessages({ includedUsage: 1000 });
	const freeProd = products.base({
		id: "free",
		items: [dashboardItem, messagesItem],
	});

	const autumnV0 = new AutumnInt({ version: ApiVersion.V0_2 });

	const { customerId, autumnV1, autumnV2 } = await initScenario({
		customerId: "check-no-feature",
		setup: [s.customer({ testClock: false }), s.products({ list: [freeProd] })],
		actions: [], // Don't attach product
	});

	// v2 response
	const resV2 = (await autumnV2.check({
		customer_id: customerId,
		feature_id: TestFeature.Messages,
	})) as unknown as CheckResponseV2;

	expect(resV2).toEqual({
		allowed: false,
		customer_id: customerId,
		required_balance: 1,
		balance: null,
	});

	// v1 response
	const resV1 = (await autumnV1.check({
		customer_id: customerId,
		feature_id: TestFeature.Messages,
	})) as unknown as CheckResponseV1;

	expect(resV1).toStrictEqual({
		allowed: false,
		customer_id: customerId,
		feature_id: TestFeature.Messages,
		required_balance: 1,
		code: SuccessCode.FeatureFound,
	});

	// v0 response
	const resV0 = (await autumnV0.check({
		customer_id: customerId,
		feature_id: TestFeature.Messages,
	})) as unknown as CheckResponseV0;

	expect(resV0.allowed).toBe(false);
	expect(resV0.balances).toBeDefined();
	expect(resV0.balances).toHaveLength(0);
});

// ═══════════════════════════════════════════════════════════════════
// CHECK: Boolean feature
// ═══════════════════════════════════════════════════════════════════

test.concurrent(`${chalk.yellowBright("check-boolean: /check on boolean feature")}`, async () => {
	const dashboardItem = items.dashboard();
	const messagesItem = items.monthlyMessages({ includedUsage: 1000 });
	const freeProd = products.base({
		id: "free",
		items: [dashboardItem, messagesItem],
	});

	const autumnV0 = new AutumnInt({ version: ApiVersion.V0_2 });

	const { customerId, autumnV1, autumnV2 } = await initScenario({
		customerId: "check-boolean",
		setup: [s.customer({ testClock: false }), s.products({ list: [freeProd] })],
		actions: [s.attach({ productId: freeProd.id })],
	});

	// v2 response
	const resV2 = (await autumnV2.check({
		customer_id: customerId,
		feature_id: TestFeature.Dashboard,
	})) as unknown as CheckResponseV2;

	expect(resV2).toMatchObject({
		allowed: true,
		customer_id: customerId,
		required_balance: 1,
		balance: {
			plan_id: freeProd.id,
			feature_id: TestFeature.Dashboard,
			unlimited: false,
			granted_balance: 0,
			purchased_balance: 0,
			current_balance: 0,
			usage: 0,
			max_purchase: null,
			overage_allowed: false,
			reset: null,
			breakdown: [
				{
					current_balance: 0,
					granted_balance: 0,
					max_purchase: null,
					overage_allowed: false,
					plan_id: freeProd.id,
					purchased_balance: 0,
					reset: null,
					usage: 0,
				},
			],
		},
	});

	// v1 response
	const resV1 = (await autumnV1.check({
		customer_id: customerId,
		feature_id: TestFeature.Dashboard,
	})) as unknown as CheckResponseV1;

	expect(resV1).toStrictEqual({
		customer_id: customerId,
		feature_id: TestFeature.Dashboard,
		code: SuccessCode.FeatureFound,
		allowed: true,
		interval: null,
		interval_count: null,
		balance: 0,
		included_usage: 0,
		usage: 0,
		next_reset_at: null,
		overage_allowed: false,
		required_balance: 1,
		unlimited: false,
		breakdown: [
			{
				balance: 0,
				included_usage: 0,
				interval: null,
				interval_count: null,
				next_reset_at: null,
				overage_allowed: false,
				usage: 0,
			},
		],
	});

	// v0 response
	const resV0 = (await autumnV0.check({
		customer_id: customerId,
		feature_id: TestFeature.Dashboard,
	})) as unknown as CheckResponseV0;

	expect(resV0).toStrictEqual({
		allowed: true,
		balances: [
			{
				feature_id: TestFeature.Dashboard,
				balance: null,
			},
		],
	});
});

// ═══════════════════════════════════════════════════════════════════
// CHECK: Metered feature
// ═══════════════════════════════════════════════════════════════════

test.concurrent(`${chalk.yellowBright("check-metered: /check on metered feature")}`, async () => {
	const messagesItem = items.monthlyMessages({ includedUsage: 1000 });
	const freeProd = products.base({
		id: "free",
		items: [messagesItem],
	});

	const autumnV0 = new AutumnInt({ version: ApiVersion.V0_2 });

	const { customerId, autumnV1, autumnV2 } = await initScenario({
		customerId: "check-metered",
		setup: [s.customer({ testClock: false }), s.products({ list: [freeProd] })],
		actions: [s.attach({ productId: freeProd.id })],
	});

	// v2 response
	const resV2 = (await autumnV2.check({
		customer_id: customerId,
		feature_id: TestFeature.Messages,
	})) as unknown as CheckResponseV2;

	expect(resV2).toMatchObject({
		allowed: true,
		customer_id: customerId,
		required_balance: 1,
		balance: {
			feature_id: "messages",
			unlimited: false,
			granted_balance: 1000,
			purchased_balance: 0,
			current_balance: 1000,
			usage: 0,
			max_purchase: null,
			overage_allowed: false,
			reset: {
				interval: ResetInterval.Month,
			},
		},
	});

	// v1 response
	const resV1 = (await autumnV1.check({
		customer_id: customerId,
		feature_id: TestFeature.Messages,
	})) as unknown as CheckResponseV1;

	const expectedResV1 = {
		allowed: true,
		customer_id: customerId,
		feature_id: TestFeature.Messages,
		required_balance: 1,
		code: SuccessCode.FeatureFound,
		interval: EntInterval.Month,
		interval_count: 1,
		unlimited: false,
		balance: 1000,
		usage: 0,
		included_usage: 1000,
		overage_allowed: false,
	};

	for (const key in expectedResV1) {
		expect(resV1[key as keyof CheckResponseV1]).toBe(
			expectedResV1[key as keyof typeof expectedResV1],
		);
	}

	// v0 response
	const resV0 = (await autumnV0.check({
		customer_id: customerId,
		feature_id: TestFeature.Messages,
	})) as unknown as CheckResponseV0;

	expect(resV0).toStrictEqual({
		allowed: true,
		balances: [
			{
				feature_id: TestFeature.Messages,
				required: 1,
				balance: 1000,
			},
		],
	});
});

// ═══════════════════════════════════════════════════════════════════
// CHECK: Unlimited feature
// ═══════════════════════════════════════════════════════════════════

test.concurrent(`${chalk.yellowBright("check-unlimited: /check on unlimited feature")}`, async () => {
	const messagesItem = items.unlimitedMessages();
	const freeProd = products.base({
		id: "free",
		items: [messagesItem],
	});

	const autumnV0 = new AutumnInt({ version: ApiVersion.V0_2 });

	const { customerId, autumnV1, autumnV2 } = await initScenario({
		customerId: "check-unlimited",
		setup: [s.customer({ testClock: false }), s.products({ list: [freeProd] })],
		actions: [s.attach({ productId: freeProd.id })],
	});

	// v2 response
	const resV2 = (await autumnV2.check({
		customer_id: customerId,
		feature_id: TestFeature.Messages,
	})) as unknown as CheckResponseV2;

	expect(resV2).toMatchObject({
		allowed: true,
		customer_id: customerId,
		required_balance: 1,
		balance: {
			plan_id: freeProd.id,
			feature_id: "messages",
			unlimited: true,
			granted_balance: 0,
			purchased_balance: 0,
			current_balance: 0,
			usage: 0,
			overage_allowed: false,
			max_purchase: null,
			reset: null,
			breakdown: [
				{
					current_balance: 0,
					granted_balance: 0,
					max_purchase: null,
					overage_allowed: false,
					plan_id: freeProd.id,
					purchased_balance: 0,
					reset: null,
					usage: 0,
				},
			],
		},
	});

	// v1 response
	const resV1 = (await autumnV1.check({
		customer_id: customerId,
		feature_id: TestFeature.Messages,
	})) as unknown as CheckResponseV1;

	const expectedResV1 = {
		allowed: true,
		customer_id: customerId,
		feature_id: TestFeature.Messages as string,
		required_balance: 1,
		code: SuccessCode.FeatureFound,
		unlimited: true,
		usage: 0,
		included_usage: 0,
		next_reset_at: null,
		overage_allowed: false,
		balance: 0,
		interval: null,
		interval_count: null,
		breakdown: [
			{
				balance: 0,
				included_usage: 0,
				interval: null,
				interval_count: null,
				next_reset_at: null,
				overage_allowed: false,
				usage: 0,
			},
		],
	};

	expect(expectedResV1).toMatchObject(resV1);

	// v0 response
	const resV0 = (await autumnV0.check({
		customer_id: customerId,
		feature_id: TestFeature.Messages,
	})) as unknown as CheckResponseV0;

	expect(resV0.allowed).toBe(true);
	expect(resV0.balances).toBeDefined();
	expect(resV0.balances).toHaveLength(1);
	expect(resV0.balances[0]).toStrictEqual({
		balance: null,
		feature_id: TestFeature.Messages,
		unlimited: true,
		usage_allowed: false,
		required: null,
	});
});

// ═══════════════════════════════════════════════════════════════════
// CHECK: Usage-based (arrear) feature
// ═══════════════════════════════════════════════════════════════════

test.concurrent(`${chalk.yellowBright("check-usage-based: /check on usage-based feature")}`, async () => {
	const messagesFeature = constructArrearItem({
		featureId: TestFeature.Messages,
		price: 0.5,
		includedUsage: 100,
	}) as LimitedItem;

	const proProd = products.base({
		id: "pro",
		items: [messagesFeature],
	});

	const autumnV0 = new AutumnInt({ version: ApiVersion.V0_2 });

	const { customerId, autumnV1, autumnV2 } = await initScenario({
		customerId: "check-usage-based",
		setup: [
			s.customer({ paymentMethod: "success", testClock: false }),
			s.products({ list: [proProd] }),
		],
		actions: [s.attach({ productId: proProd.id })],
	});

	// v2 response
	const resV2 = (await autumnV2.check({
		customer_id: customerId,
		feature_id: TestFeature.Messages,
	})) as unknown as CheckResponseV2;

	expect(resV2).toMatchObject({
		allowed: true,
		customer_id: customerId,
		required_balance: 1,
		balance: {
			feature_id: "messages",
			unlimited: false,
			granted_balance: messagesFeature.included_usage,
			purchased_balance: 0,
			current_balance: messagesFeature.included_usage,
			usage: 0,
			max_purchase: null,
			overage_allowed: true,
			reset: {
				interval: ResetInterval.Month,
			},
		},
	});
	expect(resV2.balance?.reset?.resets_at).toBeDefined();

	// v1 response
	const resV1 = (await autumnV1.check({
		customer_id: customerId,
		feature_id: TestFeature.Messages,
	})) as unknown as CheckResponseV1;

	const expectedResV1 = {
		allowed: true,
		customer_id: customerId,
		feature_id: TestFeature.Messages as string,
		required_balance: 1,
		code: SuccessCode.FeatureFound,
		unlimited: false,
		balance: messagesFeature.included_usage,
		usage: 0,
		included_usage: messagesFeature.included_usage,
		overage_allowed: true,
		interval: messagesFeature.interval,
		interval_count: 1,
	};

	expect(resV1).toMatchObject(expectedResV1);
	expect(resV1.next_reset_at).toBeDefined();

	// v0 response
	const resV0 = (await autumnV0.check({
		customer_id: customerId,
		feature_id: TestFeature.Messages,
	})) as unknown as CheckResponseV0;

	expect(resV0.allowed).toBe(true);
	expect(resV0.balances).toBeDefined();
	expect(resV0.balances).toHaveLength(1);
	expect(resV0.balances[0]).toMatchObject({
		balance: messagesFeature.included_usage,
		feature_id: TestFeature.Messages,
		unlimited: false,
		usage_allowed: true,
		required: null,
	});
});

// ═══════════════════════════════════════════════════════════════════
// CHECK: Multiple balances (one_off + monthly)
// ═══════════════════════════════════════════════════════════════════

test.concurrent(`${chalk.yellowBright("check-multiple-balances: /check on feature with multiple balances")}`, async () => {
	const monthlyMessages = constructArrearItem({
		featureId: TestFeature.Messages,
		price: 0.5,
		includedUsage: 100,
	}) as LimitedItem;

	const lifetimeMessages = constructFeatureItem({
		featureId: TestFeature.Messages,
		interval: null,
		includedUsage: 1000,
	}) as LimitedItem;

	const proProd = products.pro({
		id: "pro",
		items: [monthlyMessages, lifetimeMessages],
	});

	const autumnV0 = new AutumnInt({ version: ApiVersion.V0_2 });

	const { customerId, autumnV1, autumnV2 } = await initScenario({
		customerId: "check-multiple-balances",
		setup: [
			s.customer({ paymentMethod: "success", testClock: false }),
			s.products({ list: [proProd] }),
		],
		actions: [s.attach({ productId: proProd.id })],
	});

	// v2 response
	const resV2 = (await autumnV2.check({
		customer_id: customerId,
		feature_id: TestFeature.Messages,
	})) as unknown as CheckResponseV2;

	const expectedLifetimeBreakdown: ApiBalanceBreakdown = {
		id: expect.any(String),
		plan_id: proProd.id,
		granted_balance: 1000,
		purchased_balance: 0,
		current_balance: 1000,
		usage: 0,
		max_purchase: null,
		overage_allowed: false,
		reset: {
			interval: ResetInterval.OneOff,
			resets_at: null,
		},
		prepaid_quantity: 0,
		expires_at: null,
	};

	const expectedMonthlyBreakdown = {
		granted_balance: 100,
		purchased_balance: 0,
		current_balance: 100,
		usage: 0,
		max_purchase: null,
		reset: {
			interval: ResetInterval.Month,
		},
	};

	const actualMonthlyBreakdown = resV2.balance?.breakdown?.[0];
	const actualLifetimeBreakdown = resV2.balance?.breakdown?.[1];

	expect(actualMonthlyBreakdown).toMatchObject(expectedMonthlyBreakdown);
	expect(actualLifetimeBreakdown).toMatchObject(expectedLifetimeBreakdown);
	expect(actualMonthlyBreakdown?.reset?.resets_at).toBeDefined();

	expect(resV2).toMatchObject({
		allowed: true,
		customer_id: customerId,
		required_balance: 1,
		balance: {
			feature_id: TestFeature.Messages,
			unlimited: false,
			granted_balance:
				monthlyMessages.included_usage + lifetimeMessages.included_usage,
			purchased_balance: 0,
			current_balance:
				monthlyMessages.included_usage + lifetimeMessages.included_usage,
			usage: 0,
			max_purchase: null,
			overage_allowed: true,
			reset: {
				interval: "multiple",
				resets_at: null,
			},
		},
	});

	// v1 response
	const resV1 = (await autumnV1.check({
		customer_id: customerId,
		feature_id: TestFeature.Messages,
	})) as unknown as CheckResponseV1;

	const totalIncludedUsage =
		monthlyMessages.included_usage + lifetimeMessages.included_usage;

	const lifetimeBreakdownV1 = {
		balance: lifetimeMessages.included_usage,
		included_usage: lifetimeMessages.included_usage,
		interval: "lifetime",
		interval_count: 1,
		next_reset_at: null,
		usage: 0,
	};

	const monthlyBreakdownV1 = {
		balance: monthlyMessages.included_usage,
		included_usage: monthlyMessages.included_usage,
		interval: "month",
		interval_count: 1,
		usage: 0,
	};

	const expectedResV1 = {
		allowed: true,
		customer_id: customerId,
		feature_id: TestFeature.Messages as string,
		required_balance: 1,
		code: SuccessCode.FeatureFound,
		unlimited: false,
		balance: totalIncludedUsage,
		interval: "multiple",
		interval_count: null,
		usage: 0,
		included_usage: totalIncludedUsage,
		overage_allowed: true,
	};

	expect(resV1).toMatchObject(expectedResV1);
	expect(resV1.breakdown).toHaveLength(2);
	expect(resV1.breakdown?.[0]).toMatchObject(monthlyBreakdownV1);
	expect(resV1.breakdown?.[1]).toMatchObject(lifetimeBreakdownV1);

	// v0 response
	const resV0 = (await autumnV0.check({
		customer_id: customerId,
		feature_id: TestFeature.Messages,
	})) as unknown as CheckResponseV0;

	expect(resV0.allowed).toBe(true);
	expect(resV0.balances).toBeDefined();
	expect(resV0.balances).toHaveLength(1);
	expect(resV0.balances[0]).toMatchObject({
		balance: monthlyMessages.included_usage + lifetimeMessages.included_usage,
		feature_id: TestFeature.Messages,
		required: null,
		unlimited: false,
		usage_allowed: true,
	});
});

// ═══════════════════════════════════════════════════════════════════
// CHECK: Feature with usage limits
// ═══════════════════════════════════════════════════════════════════

test.concurrent(`${chalk.yellowBright("check-usage-limits: /check on feature with usage limits")}`, async () => {
	const messagesFeature = constructArrearItem({
		featureId: TestFeature.Messages,
		price: 0.5,
		includedUsage: 100,
		usageLimit: 500,
	}) as LimitedItem;

	const proProd = products.pro({
		id: "pro",
		items: [messagesFeature],
	});

	const autumnV0 = new AutumnInt({ version: ApiVersion.V0_2 });

	const { customerId, autumnV1, autumnV2 } = await initScenario({
		customerId: "check-usage-limits",
		setup: [
			s.customer({ paymentMethod: "success", testClock: false }),
			s.products({ list: [proProd] }),
		],
		actions: [s.attach({ productId: proProd.id })],
	});

	// v2 response
	const resV2 = (await autumnV2.check({
		customer_id: customerId,
		feature_id: TestFeature.Messages,
		required_balance: messagesFeature.usage_limit! + 1,
	})) as unknown as CheckResponseV2;

	expect(resV2).toMatchObject({
		allowed: false,
		customer_id: customerId,
		required_balance: messagesFeature.usage_limit! + 1,
		balance: {
			feature_id: "messages",
			unlimited: false,
			granted_balance: messagesFeature.included_usage,
			purchased_balance: 0,
			current_balance: messagesFeature.included_usage,
			usage: 0,
			max_purchase:
				messagesFeature.usage_limit! - messagesFeature.included_usage,
			overage_allowed: true,
			reset: {
				interval: "month",
			},
		},
	});

	// v1 response
	const resV1 = (await autumnV1.check({
		customer_id: customerId,
		feature_id: TestFeature.Messages,
		required_balance: messagesFeature.usage_limit! + 1,
	})) as unknown as CheckResponseV1;

	const expectedResV1 = {
		allowed: false,
		customer_id: customerId,
		balance: messagesFeature.included_usage,
		feature_id: TestFeature.Messages as string,
		required_balance: messagesFeature.usage_limit! + 1,
		code: SuccessCode.FeatureFound,
		unlimited: false,
		usage: 0,
		included_usage: messagesFeature.included_usage,
		overage_allowed: false,
		usage_limit: messagesFeature.usage_limit!,
		interval: "month",
		interval_count: 1,
	};

	expect(resV1).toMatchObject(expectedResV1);
	expect(resV1.next_reset_at).toBeDefined();

	// v0 response
	const resV0 = (await autumnV0.check({
		customer_id: customerId,
		feature_id: TestFeature.Messages,
		required_balance: messagesFeature.usage_limit! + 1,
	})) as unknown as CheckResponseV0;

	expect(resV0.allowed).toBe(false);
	expect(resV0.balances).toBeDefined();
	expect(resV0.balances).toHaveLength(1);
	expect(resV0.balances[0]).toMatchObject({
		balance: messagesFeature.included_usage,
		required: messagesFeature.usage_limit! + 1,
		feature_id: TestFeature.Messages,
	});
});
