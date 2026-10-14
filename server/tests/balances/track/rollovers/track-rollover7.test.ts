import { expect, test } from "bun:test";
import { type ApiCustomerV3, RolloverExpiryDurationType } from "@autumn/shared";
import { TestFeature } from "@tests/setup/v2Features.js";
import { items } from "@tests/utils/fixtures/items.js";
import { products } from "@tests/utils/fixtures/products.js";
import { timeout } from "@tests/utils/genUtils.js";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario.js";
import chalk from "chalk";

test.concurrent(`${chalk.yellowBright("track-rollover7: free product with credits rollover, track actions deduct from rollover first")}`, async () => {
	const rolloverConfig = {
		max: 300,
		length: 1,
		duration: RolloverExpiryDurationType.Month,
	};

	const creditsItem = items.monthlyCredits({
		includedUsage: 500,
		rolloverConfig,
	});

	const freeProd = products.base({
		id: "free",
		items: [creditsItem],
	});

	const customerId = "track-rollover7";

	const { autumnV1 } = await initScenario({
		customerId,
		setup: [
			s.customer({ paymentMethod: "success" }),
			s.products({ list: [freeProd] }),
		],
		actions: [
			s.attach({ productId: freeProd.id }),
			s.resetFeature({ featureId: TestFeature.Credits }),
		],
	});

	const customerAfterReset =
		await autumnV1.customers.get<ApiCustomerV3>(customerId);
	const creditsAfterReset = customerAfterReset.features[TestFeature.Credits];

	expect(creditsAfterReset?.balance).toBe(800);
	expect(creditsAfterReset?.rollovers?.[0].balance).toBe(300);

	await autumnV1.track({
		customer_id: customerId,
		feature_id: TestFeature.Action1,
		value: 100,
	});

	const customerAfterAction1 =
		await autumnV1.customers.get<ApiCustomerV3>(customerId);
	const creditsAfterAction1 =
		customerAfterAction1.features[TestFeature.Credits];

	expect(creditsAfterAction1?.rollovers?.[0].balance).toBe(280);
	expect(creditsAfterAction1?.balance).toBe(780);

	await autumnV1.track({
		customer_id: customerId,
		feature_id: TestFeature.Action2,
		value: 400,
	});

	await timeout(3000);

	const customerAfterAction2 =
		await autumnV1.customers.get<ApiCustomerV3>(customerId);
	const creditsAfterAction2 =
		customerAfterAction2.features[TestFeature.Credits];

	// @ts-expect-error (rollovers is array)
	expect(creditsAfterAction2?.rollovers[0].balance).toBe(40);
	expect(creditsAfterAction2?.balance).toBe(540);

	await autumnV1.track({
		customer_id: customerId,
		feature_id: TestFeature.Action1,
		value: 500,
	});

	await timeout(3000);

	const customerAfterAction3 =
		await autumnV1.customers.get<ApiCustomerV3>(customerId);
	const creditsAfterAction3 =
		customerAfterAction3.features[TestFeature.Credits];

	// @ts-expect-error (rollovers is array)
	expect(creditsAfterAction3?.rollovers[0].balance).toBe(0);
	expect(creditsAfterAction3?.balance).toBe(440);

	await timeout(2000);
	const nonCached = await autumnV1.customers.get<ApiCustomerV3>(customerId, {
		skip_cache: "true",
	});
	// @ts-expect-error
	expect(nonCached.features[TestFeature.Credits]?.rollovers[0].balance).toBe(0);
	expect(nonCached.features[TestFeature.Credits]?.balance).toBe(440);
});
