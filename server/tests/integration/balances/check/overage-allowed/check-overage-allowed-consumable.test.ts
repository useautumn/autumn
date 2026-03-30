import { expect, test } from "bun:test";
import type { CheckResponseV3 } from "@autumn/shared";
import { expectBoundaryAndParity } from "@tests/integration/balances/utils/spend-limit-utils/checkSpendLimitUtils.js";
import { TestFeature } from "@tests/setup/v2Features.js";
import { items } from "@tests/utils/fixtures/items.js";
import { products } from "@tests/utils/fixtures/products.js";
import { timeout } from "@tests/utils/genUtils.js";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario.js";
import chalk from "chalk";
import { setCustomerOverageAllowed } from "../../utils/overage-allowed-utils/customerOverageAllowedUtils.js";
import { normalizeCheckResponse } from "../../utils/spend-limit-utils/checkSpendLimitUtils.js";
import { setCustomerSpendLimit } from "../../utils/spend-limit-utils/customerSpendLimitUtils.js";

test.concurrent(`${chalk.yellowBright("check-consumable-overage-1: consumable, enabled:true, no spend limit — allowed:true past included")}`, async () => {
	const prod = products.base({
		id: "consumable-check-enabled",
		items: [
			items.consumableMessages({
				includedUsage: 100,
				price: 0.5,
			}),
		],
	});

	const { autumnV2_1, customerId } = await initScenario({
		customerId: "check-consumable-overage-1",
		setup: [
			s.customer({ paymentMethod: "success", testClock: false }),
			s.products({ list: [prod] }),
		],
		actions: [s.billing.attach({ productId: prod.id })],
	});

	await setCustomerOverageAllowed({
		autumn: autumnV2_1,
		customerId,
		featureId: TestFeature.Messages,
		enabled: true,
	});

	await autumnV2_1.track({
		customer_id: customerId,
		feature_id: TestFeature.Messages,
		value: 100,
	});

	const check = await autumnV2_1.check<CheckResponseV3>({
		customer_id: customerId,
		feature_id: TestFeature.Messages,
		required_balance: 50,
	});
	expect(check.allowed).toBe(true);
});

test.concurrent(`${chalk.yellowBright("check-consumable-overage-2: consumable, enabled:true, with spend limit — boundary check")}`, async () => {
	const prod = products.base({
		id: "consumable-check-spend",
		items: [
			items.consumableMessages({
				includedUsage: 100,
				price: 0.5,
			}),
		],
	});

	const { autumnV2_1, customerId } = await initScenario({
		customerId: "check-consumable-overage-2",
		setup: [
			s.customer({ paymentMethod: "success", testClock: false }),
			s.products({ list: [prod] }),
		],
		actions: [s.billing.attach({ productId: prod.id })],
	});

	await setCustomerOverageAllowed({
		autumn: autumnV2_1,
		customerId,
		featureId: TestFeature.Messages,
		enabled: true,
	});

	await setCustomerSpendLimit({
		autumn: autumnV2_1,
		customerId,
		featureId: TestFeature.Messages,
		overageLimit: 25,
	});

	await autumnV2_1.track({
		customer_id: customerId,
		feature_id: TestFeature.Messages,
		value: 120,
	});

	await expectBoundaryAndParity({
		autumn: autumnV2_1,
		customerId,
		featureId: TestFeature.Messages,
		allowedRequiredBalance: 5,
		blockedRequiredBalance: 6,
	});
});

test.concurrent(`${chalk.yellowBright("check-consumable-overage-3: consumable, enabled:false, remaining at 0 — allowed:false")}`, async () => {
	const prod = products.base({
		id: "consumable-check-disabled",
		items: [
			items.consumableMessages({
				includedUsage: 100,
				price: 0.5,
			}),
		],
	});

	const { autumnV2_1, customerId } = await initScenario({
		customerId: "check-consumable-overage-3",
		setup: [
			s.customer({ paymentMethod: "success", testClock: false }),
			s.products({ list: [prod] }),
		],
		actions: [s.billing.attach({ productId: prod.id })],
	});

	await autumnV2_1.track({
		customer_id: customerId,
		feature_id: TestFeature.Messages,
		value: 100,
	});

	await setCustomerOverageAllowed({
		autumn: autumnV2_1,
		customerId,
		featureId: TestFeature.Messages,
		enabled: false,
	});

	const check = await autumnV2_1.check<CheckResponseV3>({
		customer_id: customerId,
		feature_id: TestFeature.Messages,
		required_balance: 1,
	});
	expect(check.allowed).toBe(false);
});

test.concurrent(`${chalk.yellowBright("check-consumable-overage-4: consumable, enabled:false overrides native overage_allowed")}`, async () => {
	const prod = products.base({
		id: "consumable-check-override",
		items: [
			items.consumableMessages({
				includedUsage: 100,
				price: 0.5,
			}),
		],
	});

	const { autumnV2_1, customerId } = await initScenario({
		customerId: "check-consumable-overage-4",
		setup: [
			s.customer({ paymentMethod: "success", testClock: false }),
			s.products({ list: [prod] }),
		],
		actions: [s.billing.attach({ productId: prod.id })],
	});

	await setCustomerOverageAllowed({
		autumn: autumnV2_1,
		customerId,
		featureId: TestFeature.Messages,
		enabled: false,
	});

	const checkWithRemaining = await autumnV2_1.check<CheckResponseV3>({
		customer_id: customerId,
		feature_id: TestFeature.Messages,
		required_balance: 50,
	});
	expect(checkWithRemaining.allowed).toBe(true);

	await autumnV2_1.track({
		customer_id: customerId,
		feature_id: TestFeature.Messages,
		value: 100,
	});

	const checkAtZero = await autumnV2_1.check<CheckResponseV3>({
		customer_id: customerId,
		feature_id: TestFeature.Messages,
		required_balance: 1,
	});
	expect(checkAtZero.allowed).toBe(false);
});

test.concurrent(`${chalk.yellowBright("check-consumable-overage-5: consumable, enabled:false, cache/DB parity")}`, async () => {
	const prod = products.base({
		id: "consumable-check-parity",
		items: [
			items.consumableMessages({
				includedUsage: 100,
				price: 0.5,
			}),
		],
	});

	const { autumnV2_1, customerId } = await initScenario({
		customerId: "check-consumable-overage-5",
		setup: [
			s.customer({ paymentMethod: "success", testClock: false }),
			s.products({ list: [prod] }),
		],
		actions: [s.billing.attach({ productId: prod.id })],
	});

	await autumnV2_1.track({
		customer_id: customerId,
		feature_id: TestFeature.Messages,
		value: 100,
	});

	await setCustomerOverageAllowed({
		autumn: autumnV2_1,
		customerId,
		featureId: TestFeature.Messages,
		enabled: false,
	});

	const cached = await autumnV2_1.check<CheckResponseV3>({
		customer_id: customerId,
		feature_id: TestFeature.Messages,
		required_balance: 1,
	});
	expect(cached.allowed).toBe(false);

	await timeout(4000);

	const uncached = await autumnV2_1.check<CheckResponseV3>({
		customer_id: customerId,
		feature_id: TestFeature.Messages,
		required_balance: 1,
		skip_cache: true,
	});
	expect(uncached.allowed).toBe(false);

	expect(normalizeCheckResponse(uncached)).toEqual(
		normalizeCheckResponse(cached),
	);
});
