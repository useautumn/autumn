/**
 * Regression test for drained standalone balances leaking into customers.list.
 *
 * A standalone balance is a customer_entitlement with customer_product_id = NULL
 * (created by balances.create, or minted as a carry-over on plan transitions).
 * It surfaces in the API as a breakdown item with plan_id: null.
 *
 * Once such a grant is fully consumed it is dead weight: it can't be spent, but
 * it still adds its grant to `granted` and its consumption to `usage`.
 * getFullSubject (customers.get) already filtered those rows out; the two
 * customers.list queries did not.
 *
 * Red-failure mode (reported):
 *  - customers.list reports granted 20,000 / usage 186,446
 *  - customers.get  reports granted 10,000 / usage 176,446
 *  Both deltas are exactly the drained standalone grant.
 *
 * Green-success criteria:
 *  - A standalone grant with balance remaining shows up on every read path.
 *  - A fully drained one shows up on none of them.
 */

import { expect, test } from "bun:test";
import type { ApiCustomerV5 } from "@autumn/shared";
import { TestFeature } from "@tests/setup/v2Features.js";
import { items } from "@tests/utils/fixtures/items.js";
import { products } from "@tests/utils/fixtures/products.js";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario.js";
import chalk from "chalk";
import type { AutumnInt } from "@/external/autumn/autumnCli.js";

const PLAN_GRANT = 10_000;
const STANDALONE_GRANT = 10_000;

/**
 * Asserts customers.get and both customers.list paginations report the same
 * balance. `standaloneGrant: null` means the plan_id: null breakdown item must
 * be absent from every read path.
 */
const expectBalanceParityAcrossReadPaths = async ({
	autumnV2_2,
	autumnV2_3,
	customerId,
	featureId,
	granted,
	usage,
	standaloneGrant,
}: {
	autumnV2_2: AutumnInt;
	autumnV2_3: AutumnInt;
	customerId: string;
	featureId: string;
	granted: number;
	usage: number;
	standaloneGrant: number | null;
}) => {
	const fetched = await autumnV2_2.customers.get<ApiCustomerV5>(customerId);
	// Forces a FullSubject rebuild from Postgres rather than a cache read — a
	// warm subject keeps rows the rebuild query would filter out.
	const rebuilt = await autumnV2_2.customers.get<ApiCustomerV5>(customerId, {
		skip_cache: "true",
	});
	const offsetPage = (await autumnV2_2.customers.listV2({
		search: customerId,
	})) as { list: ApiCustomerV5[] };
	const cursorPage = (await autumnV2_3.customers.listV2({
		search: customerId,
		limit: 10,
	})) as { list: ApiCustomerV5[] };

	const sources = [
		["customers.get", fetched],
		["customers.get (skip_cache)", rebuilt],
		[
			"customers.list offset (v2.2)",
			offsetPage.list.find((c) => c.id === customerId),
		],
		[
			"customers.list cursor (v2.3)",
			cursorPage.list.find((c) => c.id === customerId),
		],
	] as const;

	for (const [label, customer] of sources) {
		expect(customer, `${label}: customer missing`).toBeDefined();

		const balance = customer?.balances[featureId];
		expect(balance?.granted, `${label}: granted`).toBe(granted);
		expect(balance?.usage, `${label}: usage`).toBe(usage);
		expect(balance?.remaining, `${label}: remaining`).toBe(granted - usage);

		const standaloneItem = balance?.breakdown?.find(
			(item) => item.plan_id === null,
		);

		if (standaloneGrant === null) {
			expect(
				standaloneItem,
				`${label}: drained standalone should be excluded`,
			).toBeUndefined();
			continue;
		}

		expect(
			standaloneItem,
			`${label}: standalone breakdown item missing`,
		).toBeDefined();
		expect(standaloneItem?.included_grant, `${label}: standalone grant`).toBe(
			standaloneGrant,
		);
	}
};

test.concurrent(
	`${chalk.yellowBright("list-customers standalone balances: partially used standalone grant is reported on every read path")}`,
	async () => {
		const customerId = "list-cus-standalone-partial";
		const usage = 500;

		const pro = products.pro({
			id: "pro-standalone-partial",
			items: [items.monthlyMessages({ includedUsage: PLAN_GRANT })],
		});

		const { autumnV2_2, autumnV2_3 } = await initScenario({
			customerId,
			setup: [
				s.customer({ testClock: false, paymentMethod: "success" }),
				s.products({ list: [pro] }),
			],
			actions: [s.attach({ productId: pro.id })],
		});

		await autumnV2_2.balances.create({
			customer_id: customerId,
			feature_id: TestFeature.Messages,
			included_grant: STANDALONE_GRANT,
		});

		await autumnV2_2.track({
			customer_id: customerId,
			feature_id: TestFeature.Messages,
			value: usage,
		});
		await new Promise((resolve) => setTimeout(resolve, 3000));

		await expectBalanceParityAcrossReadPaths({
			autumnV2_2,
			autumnV2_3,
			customerId,
			featureId: TestFeature.Messages,
			granted: PLAN_GRANT + STANDALONE_GRANT,
			usage,
			standaloneGrant: STANDALONE_GRANT,
		});
	},
);

// Mirrors the reported prod shape. Pre-fix, customers.list kept the drained
// grant and reported granted/usage 10,000 higher than customers.get.
test.concurrent(
	`${chalk.yellowBright("list-customers standalone balances: fully drained standalone grant is excluded from every read path")}`,
	async () => {
		const customerId = "list-cus-standalone-drained";

		const pro = products.pro({
			id: "pro-standalone-drained",
			items: [items.monthlyMessages({ includedUsage: PLAN_GRANT })],
		});

		const { autumnV2_2, autumnV2_3 } = await initScenario({
			customerId,
			setup: [
				s.customer({ testClock: false, paymentMethod: "success" }),
				s.products({ list: [pro] }),
			],
			actions: [s.attach({ productId: pro.id })],
		});

		await autumnV2_2.balances.create({
			customer_id: customerId,
			feature_id: TestFeature.Messages,
			included_grant: STANDALONE_GRANT,
		});

		// Drains the plan grant and then the standalone grant to zero.
		await autumnV2_2.track({
			customer_id: customerId,
			feature_id: TestFeature.Messages,
			value: PLAN_GRANT + STANDALONE_GRANT,
		});
		await new Promise((resolve) => setTimeout(resolve, 3000));

		// Only the plan cusEnt survives: it is drained too, but it is not loose.
		await expectBalanceParityAcrossReadPaths({
			autumnV2_2,
			autumnV2_3,
			customerId,
			featureId: TestFeature.Messages,
			granted: PLAN_GRANT,
			usage: PLAN_GRANT,
			standaloneGrant: null,
		});
	},
);
