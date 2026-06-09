import { test } from "bun:test";
import { TestFeature } from "@tests/setup/v2Features";
import { items } from "@tests/utils/fixtures/items";
import { products } from "@tests/utils/fixtures/products";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario";
import chalk from "chalk";

/**
 * Migration setup: users entitlement with existing usage.
 *
 *   v1  $20/mo · 5 included users   → cus migusers-v1 (used 4)
 *   v2  $20/mo · 10 included users  (latest, no customer)
 */
test(`${chalk.yellowBright("migration-setup: users included with usage")}`, async () => {
	const team = products.base({
		id: "team-users",
		items: [
			items.monthlyPrice({ price: 20 }),
			items.monthlyUsers({ includedUsage: 5 }),
		],
	});

	const { autumnV1 } = await initScenario({
		customerId: "migusers-v1",
		setup: [
			s.customer({ paymentMethod: "success", testClock: false }),
			s.products({ list: [team], prefix: "migusers" }),
		],
		actions: [
			s.billing.attach({ productId: team.id }),
			s.track({ featureId: TestFeature.Users, value: 4, timeout: 2000 }),
		],
	});

	await autumnV1.products.update(team.id, {
		items: [
			items.monthlyPrice({ price: 20 }),
			items.monthlyUsers({ includedUsage: 10 }),
		],
	});

	console.log(
		chalk.green(
			`[migration-setup] plan "${team.id}" has v1-v2. migusers-v1 is on v1 with 5 users included and 4 users used; latest is v2.`,
		),
	);
}, 20_000);
