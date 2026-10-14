/** biome-ignore-all lint/suspicious/noExplicitAny: test file */

import { expect, test } from "bun:test";
import { expectProductTrialing } from "@tests/integration/billing/utils/expectCustomerProductTrialing";
import { expectSubToBeCorrect } from "@tests/merged/mergeUtils/expectSubCorrect";
import { TestFeature } from "@tests/setup/v2Features";
import { expectProductAttached } from "@tests/utils/expectUtils/expectProductAttached";
import { items } from "@tests/utils/fixtures/items";
import { products } from "@tests/utils/fixtures/products";
import { advanceTestClock } from "@tests/utils/stripeUtils";
import ctx from "@tests/utils/testInitUtils/createTestContext";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario";
import chalk from "chalk";
import { addDays } from "date-fns";
import { timeout } from "@/utils/genUtils";

test.concurrent(`${chalk.yellowBright("legacy-trial-merged 1: trial anchor alignment for entities")}`, async () => {
	const customerId = "legacy-trial-merged-1";

	const wordsItem = items.consumableWords();
	const premiumPrice = items.monthlyPrice({ price: 50 });
	const premium = products.base({
		id: "premium",
		items: [wordsItem, premiumPrice],
		trialDays: 7,
	});

	const { autumnV1, testClockId, entities } = await initScenario({
		customerId,
		setup: [
			s.customer({ paymentMethod: "success", testClock: true }),
			s.products({ list: [premium] }),
			s.entities({ count: 2, featureId: TestFeature.Users }),
		],
		actions: [s.attach({ productId: premium.id, entityIndex: 0 })],
	});

	await advanceTestClock({
		stripeCli: ctx.stripeCli,
		testClockId: testClockId!,
		advanceTo: addDays(new Date(), 2).getTime(),
	});

	const entity1 = await autumnV1.entities.get(customerId, entities[0].id);
	const premium1 = entity1.products.find((p: any) => p.id === premium.id);
	expect(premium1?.current_period_end).toBeDefined();
	const periodEnd = premium1!.current_period_end as number;

	const checkout = await autumnV1.checkout({
		customer_id: customerId,
		product_id: premium.id,
		entity_id: entities[1].id,
	});

	const nextCycle = checkout.next_cycle;
	expect(nextCycle?.starts_at).toBeDefined();
	expect(Math.abs((nextCycle?.starts_at ?? 0) - periodEnd)).toBeLessThanOrEqual(
		60000,
	);
	await autumnV1.attach({
		customer_id: customerId,
		product_id: premium.id,
		entity_id: entities[1].id,
	});

	const entity2 = await autumnV1.entities.get(customerId, entities[1].id);
	await expectProductTrialing({
		customer: entity2,
		productId: premium.id,
		trialEndsAt: periodEnd,
		toleranceMs: 60000,
	});
});

test.concurrent(`${chalk.yellowBright("legacy-trial-merged 2: add second entity after trial ends")}`, async () => {
	const customerId = "legacy-trial-merged-2";

	const wordsItem = items.consumableWords();
	const premiumPrice = items.monthlyPrice({ price: 50 });
	const premium = products.base({
		id: "premium",
		items: [wordsItem, premiumPrice],
		trialDays: 7,
	});

	const { autumnV1, testClockId, entities } = await initScenario({
		customerId,
		setup: [
			s.customer({ paymentMethod: "success", testClock: true }),
			s.products({ list: [premium] }),
			s.entities({ count: 2, featureId: TestFeature.Users }),
		],
		actions: [s.attach({ productId: premium.id, entityIndex: 0 })],
	});

	await advanceTestClock({
		stripeCli: ctx.stripeCli,
		testClockId: testClockId!,
		advanceTo: addDays(new Date(), 8).getTime(),
	});

	await autumnV1.attach({
		customer_id: customerId,
		product_id: premium.id,
		entity_id: entities[1].id,
	});

	const entity2 = await autumnV1.entities.get(customerId, entities[1].id);
	expectProductAttached({
		customer: entity2 as any,
		productId: premium.id,
	});

	await expectSubToBeCorrect({
		db: ctx.db,
		customerId,
		org: ctx.org,
		env: ctx.env,
	});
});

test.concurrent(`${chalk.yellowBright("legacy-trial-merged 3: upgrade entities from trial pro to premium (not trialing)")}`, async () => {
	const customerId = "legacy-trial-merged-3";

	const wordsItem = items.consumableWords();
	const proPrice = items.monthlyPrice({ price: 20 });
	const premiumPrice = items.monthlyPrice({ price: 50 });

	const pro = products.base({
		id: "pro",
		items: [wordsItem, proPrice],
		trialDays: 7,
	});
	const premium = products.base({
		id: "premium",
		items: [wordsItem, premiumPrice],
		trialDays: 7,
	});

	const { autumnV1, testClockId, entities } = await initScenario({
		customerId,
		setup: [
			s.customer({ paymentMethod: "success", testClock: true }),
			s.products({ list: [pro, premium] }),
			s.entities({ count: 2, featureId: TestFeature.Users }),
		],
		actions: [
			s.attach({ productId: pro.id, entityIndex: 0 }),
			s.attach({ productId: pro.id, entityIndex: 1 }),
		],
	});

	await advanceTestClock({
		stripeCli: ctx.stripeCli,
		testClockId: testClockId!,
		advanceTo: addDays(new Date(), 10).getTime(),
	});

	await autumnV1.attach({
		customer_id: customerId,
		product_id: premium.id,
		entity_id: entities[0].id,
	});

	const entity1 = await autumnV1.entities.get(customerId, entities[0].id);
	expectProductAttached({
		customer: entity1,
		productId: premium.id,
	});

	await expectProductTrialing({
		customer: entity1,
		productId: premium.id,
	});

	await autumnV1.attach({
		customer_id: customerId,
		product_id: premium.id,
		entity_id: entities[1].id,
	});

	await timeout(5000);
	const entity2 = await autumnV1.entities.get(customerId, entities[1].id);
	expectProductAttached({
		customer: entity2,
		productId: premium.id,
	});
	await expectProductTrialing({
		customer: entity2,
		productId: premium.id,
	});

	await expectSubToBeCorrect({
		db: ctx.db,
		customerId,
		org: ctx.org,
		env: ctx.env,
	});
});
