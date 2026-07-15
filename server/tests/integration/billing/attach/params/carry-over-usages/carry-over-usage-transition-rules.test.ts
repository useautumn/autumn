/**
 * TDD contract: org transition rules are inherited by attach / updateSubscription
 * when the request does not pass carry_over_usages explicitly.
 *
 * Contract under test:
 *   New behaviors:
 *     - org rule { enabled: true } + attach WITHOUT param -> usage carried
 *       (attach's own default does NOT carry consumables)
 *     - org rule { enabled: true, feature_ids: [words] } -> messages NOT carried
 *     - explicit carry_over_usages param overrides the org rule
 *     - updateSubscription (trial→paid) honors a restrictive org rule when the
 *       param is absent (its own default is carry-all)
 *
 * Pre-impl red: the PATCH /organization/transition_rules route 404s and attach
 * ignores org rules, so carried-balance assertions fail at the VALUE layer.
 * Post-impl green: rules persist and resolve into attach/update as defaults.
 *
 * NOTE: these tests mutate org-level state (the transition rule), so they are
 * intentionally sequential (plain `test`) and always clear the rule in finally.
 */

import { test } from "bun:test";
import type { ApiCustomerV3 } from "@autumn/shared";
import { expectCustomerFeatureCorrect } from "@tests/integration/billing/utils/expectCustomerFeatureCorrect";
import { TestFeature } from "@tests/setup/v2Features";
import { items } from "@tests/utils/fixtures/items";
import { products } from "@tests/utils/fixtures/products";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario";
import chalk from "chalk";
import { AutumnInt } from "@/external/autumn/autumnCli.js";

const REDIS_SYNC_MS = 2000;

const setTransitionRule = async ({
	secretKey,
	carryOverUsages,
}: {
	secretKey: string;
	carryOverUsages: { enabled: boolean; feature_ids?: string[] } | null;
}) => {
	const autumn = new AutumnInt({ secretKey });
	await autumn.patch("/organization/transition_rules", {
		carry_over_usages: carryOverUsages,
	});
};

const clearTransitionRule = async ({ secretKey }: { secretKey: string }) => {
	const autumn = new AutumnInt({ secretKey });
	await autumn
		.patch("/organization/transition_rules", { carry_over_usages: null })
		.catch(() => undefined);
};

// ═══════════════════════════════════════════════════════════════════════════
// Assertion 1 — org rule { enabled: true }: attach without param carries usage
//
// Pro: 50 messages, 40 used. Org rule enabled. Attach Premium (200) WITHOUT
// carry_over_usages. Expected: balance 160, usage 40.
// Pre-fix: attach default does not carry consumables -> balance 200, usage 0.
// ═══════════════════════════════════════════════════════════════════════════
test(`${chalk.yellowBright("transition-rules 1: org rule enabled -> attach inherits carry_over_usages")}`, async () => {
	const pro = products.pro({
		id: "tr-inherit-pro",
		items: [items.monthlyMessages({ includedUsage: 50 })],
	});
	const premium = products.premium({
		id: "tr-inherit-premium",
		items: [items.monthlyMessages({ includedUsage: 200 })],
	});

	const { customerId, autumnV2_1, autumnV1, ctx } = await initScenario({
		customerId: "transition-rules-inherit",
		setup: [
			s.customer({ paymentMethod: "success" }),
			s.products({ list: [pro, premium] }),
		],
		actions: [s.attach({ productId: pro.id, timeout: 4000 })],
	});

	try {
		await autumnV2_1.track({
			customer_id: customerId,
			feature_id: TestFeature.Messages,
			value: 40,
		});
		await new Promise((resolve) => setTimeout(resolve, REDIS_SYNC_MS));

		await setTransitionRule({
			secretKey: ctx.orgSecretKey,
			carryOverUsages: { enabled: true },
		});

		// No carry_over_usages param — must come from the org rule.
		await autumnV2_1.billing.attach({
			customer_id: customerId,
			plan_id: premium.id,
		});
		await new Promise((resolve) => setTimeout(resolve, REDIS_SYNC_MS));

		const customer = await autumnV1.customers.get<ApiCustomerV3>(customerId);
		expectCustomerFeatureCorrect({
			customer,
			featureId: TestFeature.Messages,
			balance: 160,
			usage: 40,
		});
	} finally {
		await clearTransitionRule({ secretKey: ctx.orgSecretKey });
	}
});

// ═══════════════════════════════════════════════════════════════════════════
// Assertion 2 — org rule feature_ids scoping: unlisted consumables reset
//
// Same shape, but the rule only lists words. Messages must NOT carry.
// ═══════════════════════════════════════════════════════════════════════════
test(`${chalk.yellowBright("transition-rules 2: rule feature_ids excludes messages -> no carry")}`, async () => {
	const pro = products.pro({
		id: "tr-scope-pro",
		items: [items.monthlyMessages({ includedUsage: 50 })],
	});
	const premium = products.premium({
		id: "tr-scope-premium",
		items: [items.monthlyMessages({ includedUsage: 200 })],
	});

	const { customerId, autumnV2_1, autumnV1, ctx } = await initScenario({
		customerId: "transition-rules-scope",
		setup: [
			s.customer({ paymentMethod: "success" }),
			s.products({ list: [pro, premium] }),
		],
		actions: [s.attach({ productId: pro.id, timeout: 4000 })],
	});

	try {
		await autumnV2_1.track({
			customer_id: customerId,
			feature_id: TestFeature.Messages,
			value: 40,
		});
		await new Promise((resolve) => setTimeout(resolve, REDIS_SYNC_MS));

		await setTransitionRule({
			secretKey: ctx.orgSecretKey,
			carryOverUsages: { enabled: true, feature_ids: [TestFeature.Words] },
		});

		await autumnV2_1.billing.attach({
			customer_id: customerId,
			plan_id: premium.id,
		});
		await new Promise((resolve) => setTimeout(resolve, REDIS_SYNC_MS));

		const customer = await autumnV1.customers.get<ApiCustomerV3>(customerId);
		expectCustomerFeatureCorrect({
			customer,
			featureId: TestFeature.Messages,
			balance: 200,
			usage: 0,
		});
	} finally {
		await clearTransitionRule({ secretKey: ctx.orgSecretKey });
	}
});

// ═══════════════════════════════════════════════════════════════════════════
// Assertion 3 — explicit param wins over the org rule
//
// Org rule enabled, but attach passes { enabled: false } -> no carry.
// ═══════════════════════════════════════════════════════════════════════════
test(`${chalk.yellowBright("transition-rules 3: explicit carry_over_usages param overrides org rule")}`, async () => {
	const pro = products.pro({
		id: "tr-override-pro",
		items: [items.monthlyMessages({ includedUsage: 50 })],
	});
	const premium = products.premium({
		id: "tr-override-premium",
		items: [items.monthlyMessages({ includedUsage: 200 })],
	});

	const { customerId, autumnV2_1, autumnV1, ctx } = await initScenario({
		customerId: "transition-rules-override",
		setup: [
			s.customer({ paymentMethod: "success" }),
			s.products({ list: [pro, premium] }),
		],
		actions: [s.attach({ productId: pro.id, timeout: 4000 })],
	});

	try {
		await autumnV2_1.track({
			customer_id: customerId,
			feature_id: TestFeature.Messages,
			value: 40,
		});
		await new Promise((resolve) => setTimeout(resolve, REDIS_SYNC_MS));

		await setTransitionRule({
			secretKey: ctx.orgSecretKey,
			carryOverUsages: { enabled: true },
		});

		await autumnV2_1.billing.attach({
			customer_id: customerId,
			plan_id: premium.id,
			carry_over_usages: { enabled: false },
		});
		await new Promise((resolve) => setTimeout(resolve, REDIS_SYNC_MS));

		const customer = await autumnV1.customers.get<ApiCustomerV3>(customerId);
		expectCustomerFeatureCorrect({
			customer,
			featureId: TestFeature.Messages,
			balance: 200,
			usage: 0,
		});
	} finally {
		await clearTransitionRule({ secretKey: ctx.orgSecretKey });
	}
});

// ═══════════════════════════════════════════════════════════════════════════
// Assertion 4 — updateSubscription inherits a restrictive rule
//
// Trial→paid conversion (update's default is carry-all). Org rule only lists
// words, so messages must reset on conversion.
// Pre-fix: update ignores org rules -> usage carried (balance 60).
// ═══════════════════════════════════════════════════════════════════════════
test(`${chalk.yellowBright("transition-rules 4: updateSubscription inherits restrictive org rule")}`, async () => {
	const proTrial = products.proWithTrial({
		id: "tr-update-pro-trial",
		items: [items.monthlyMessages({ includedUsage: 100 })],
		trialDays: 14,
	});

	const { customerId, autumnV1, autumnV2_3, autumnV2_1, ctx } =
		await initScenario({
			customerId: "transition-rules-update",
			setup: [
				s.customer({ testClock: true, paymentMethod: "success" }),
				s.products({ list: [proTrial] }),
			],
			actions: [s.attach({ productId: proTrial.id })],
		});

	try {
		await autumnV2_1.track({
			customer_id: customerId,
			feature_id: TestFeature.Messages,
			value: 40,
		});
		await new Promise((resolve) => setTimeout(resolve, REDIS_SYNC_MS));

		await setTransitionRule({
			secretKey: ctx.orgSecretKey,
			carryOverUsages: { enabled: true, feature_ids: [TestFeature.Words] },
		});

		await autumnV2_3.billing.update(
			{
				customer_id: customerId,
				plan_id: proTrial.id,
				customize: { free_trial: null },
			},
			{ timeout: 5000 },
		);
		await new Promise((resolve) => setTimeout(resolve, REDIS_SYNC_MS));

		const customer = await autumnV1.customers.get<ApiCustomerV3>(customerId);
		expectCustomerFeatureCorrect({
			customer,
			featureId: TestFeature.Messages,
			balance: 100,
			usage: 0,
		});
	} finally {
		await clearTransitionRule({ secretKey: ctx.orgSecretKey });
	}
});
