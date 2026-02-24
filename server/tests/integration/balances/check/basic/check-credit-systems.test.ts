import { expect, test } from "bun:test";
import type { CheckResponseV1 } from "@autumn/shared";
import { TestFeature } from "@tests/setup/v2Features.js";
import { items } from "@tests/utils/fixtures/items.js";
import { products } from "@tests/utils/fixtures/products.js";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario.js";
import chalk from "chalk";
import { Decimal } from "decimal.js";

// ═══════════════════════════════════════════════════════════════════
// CHECK: Credit systems
// ═══════════════════════════════════════════════════════════════════

test.concurrent(`${chalk.yellowBright("check-credit-system1: attach free, check action1 allowed, credits not allowed")}`, async () => {
	const action1Item = items.free({
		featureId: TestFeature.Action1,
	});
	const creditItem = items.monthlyCredits();
	const freeProd = products.base({
		id: "free",
		items: [action1Item],
	});
	const proProd = products.pro({
		id: "pro",
		items: [creditItem],
	});

	const { customerId, autumnV1 } = await initScenario({
		customerId: "check-credit-system1",
		setup: [
			s.customer({ paymentMethod: "success" }),
			s.products({ list: [freeProd, proProd] }),
		],
		actions: [s.attach({ productId: freeProd.id })],
	});

	const actionCheck = await autumnV1.check<CheckResponseV1>({
		customer_id: customerId,
		feature_id: TestFeature.Action1,
	});
	const creditsCheck = await autumnV1.check<CheckResponseV1>({
		customer_id: customerId,
		feature_id: TestFeature.Credits,
	});

	expect(actionCheck.allowed).toBe(true);
	expect(creditsCheck.allowed).toBe(false);
});

test.concurrent(`${chalk.yellowBright("check-credit-system2: attach pro, check credits and action1 allowed")}`, async () => {
	const action1Item = items.free({
		featureId: TestFeature.Action1,
	});
	const creditItem = items.monthlyCredits();
	const freeProd = products.base({
		id: "free",
		items: [action1Item],
	});
	const proProd = products.pro({
		id: "pro",
		items: [creditItem],
	});

	const { customerId, autumnV1 } = await initScenario({
		customerId: "check-credit-system2",
		setup: [
			s.customer({ paymentMethod: "success" }),
			s.products({ list: [freeProd, proProd] }),
		],
		actions: [
			s.attach({ productId: freeProd.id }),
			s.attach({ productId: proProd.id }),
		],
	});

	const creditsCheck = await autumnV1.check<CheckResponseV1>({
		customer_id: customerId,
		feature_id: TestFeature.Credits,
	});
	const actionCheck = await autumnV1.check<CheckResponseV1>({
		customer_id: customerId,
		feature_id: TestFeature.Action1,
	});

	expect(actionCheck.allowed).toBe(true);
	expect(creditsCheck.allowed).toBe(true);
});

test.concurrent(`${chalk.yellowBright("check-credit-system3: use credits and have correct check response")}`, async () => {
	const creditCost = 0.2;
	const action1Item = items.free({
		featureId: TestFeature.Action1,
	});
	const creditItem = items.monthlyCredits();
	const freeProd = products.base({
		id: "free",
		items: [action1Item],
	});
	const proProd = products.pro({
		id: "pro",
		items: [creditItem],
	});

	const { customerId, autumnV1 } = await initScenario({
		customerId: "check-credit-system3",
		setup: [
			s.customer({ paymentMethod: "success" }),
			s.products({ list: [freeProd, proProd] }),
		],
		actions: [
			s.attach({ productId: freeProd.id }),
			s.attach({ productId: proProd.id }),
			s.track({
				featureId: TestFeature.Action1,
				value: 50,
				timeout: 3000,
			}),
		],
	});

	const usage = 50;
	const creditUsage = new Decimal(creditCost).mul(usage).toNumber();
	const creditBalance = new Decimal(creditItem.included_usage)
		.sub(creditUsage)
		.toNumber();

	const creditsCheck = await autumnV1.check<CheckResponseV1>({
		customer_id: customerId,
		feature_id: TestFeature.Credits,
	});

	expect(creditsCheck.balance).toBe(creditBalance);
});
