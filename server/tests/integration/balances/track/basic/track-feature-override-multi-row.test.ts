/**
 * Contract: when several balances fund one credit feature, each row admits a
 * feature by its own effective schema. A row whose plan excludes the feature
 * is skipped, never spilled into; a loose grant prices at the catalog rate.
 */

import { expect, test } from "bun:test";
import type {
	ApiCustomerV5,
	CheckResponseV3,
	FeatureConfigOverride,
} from "@autumn/shared";
import { TestFeature } from "@tests/setup/v2Features.js";
import { items } from "@tests/utils/fixtures/items.js";
import { products } from "@tests/utils/fixtures/products.js";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario.js";
import chalk from "chalk";
import type { AutumnInt } from "@/external/autumn/autumnCli.js";

// Catalog Credits schema: Action1 = 0.2, Action2 = 0.6 (see v2Features.ts).

const excludesAction1: FeatureConfigOverride = {
	schema: [{ metered_feature_id: TestFeature.Action1, excluded: true }],
};

const creditsItem = ({
	grant,
	featureOverride,
}: {
	grant: number;
	featureOverride?: FeatureConfigOverride;
}) => {
	const item = items.free({
		featureId: TestFeature.Credits,
		includedUsage: grant,
	});
	return {
		...item,
		config: { ...item.config, feature_override: featureOverride },
	};
};

/** Remaining credits per funding row, keyed by plan id (null for a loose grant). */
const expectCreditsRemainingByPlan = async ({
	autumn,
	customerId,
	remainingByPlan,
}: {
	autumn: AutumnInt;
	customerId: string;
	remainingByPlan: Record<string, number>;
}) => {
	const customer = await autumn.customers.get<ApiCustomerV5>(customerId, {
		skip_cache: "true",
	});
	const breakdown = customer.balances[TestFeature.Credits]?.breakdown ?? [];
	const actual = Object.fromEntries(
		breakdown.map((row) => [String(row.plan_id), row.remaining]),
	);
	expect(actual).toEqual(remainingByPlan);
};

test.concurrent(
	`${chalk.yellowBright("multi-row credit override: base excludes, add-on inherits — the feature draws only the add-on")}`,
	async () => {
		const base = products.base({
			id: "base",
			items: [creditsItem({ grant: 100, featureOverride: excludesAction1 })],
		});
		const addOn = products.base({
			id: "addon",
			isAddOn: true,
			items: [creditsItem({ grant: 100 })],
		});

		const { customerId, autumnV1, autumnV2_3 } = await initScenario({
			customerId: "override-multi-row-base-excludes",
			setup: [
				s.customer({ testClock: false }),
				s.products({ list: [base, addOn] }),
			],
			actions: [
				s.attach({ productId: base.id }),
				s.attach({ productId: addOn.id }),
			],
		});

		// 400 Action1 x 0.2 = 80 credits: fundable by the add-on alone.
		const check = await autumnV2_3.check<CheckResponseV3>({
			customer_id: customerId,
			feature_id: TestFeature.Action1,
			required_balance: 400,
		});
		expect(check.allowed).toBe(true);

		await autumnV1.track({
			customer_id: customerId,
			feature_id: TestFeature.Action1,
			value: 400,
		});

		await expectCreditsRemainingByPlan({
			autumn: autumnV2_3,
			customerId,
			remainingByPlan: { [base.id]: 100, [addOn.id]: 20 },
		});
	},
);

test.concurrent(
	`${chalk.yellowBright("multi-row credit override: add-on excludes, base inherits — draining base never spills into the add-on")}`,
	async () => {
		const base = products.base({
			id: "base",
			items: [creditsItem({ grant: 100 })],
		});
		const addOn = products.base({
			id: "addon",
			isAddOn: true,
			items: [creditsItem({ grant: 1_000, featureOverride: excludesAction1 })],
		});

		const { customerId, autumnV1, autumnV2_3 } = await initScenario({
			customerId: "override-multi-row-addon-excludes",
			setup: [
				s.customer({ testClock: false }),
				s.products({ list: [base, addOn] }),
			],
			actions: [
				s.attach({ productId: base.id }),
				s.attach({ productId: addOn.id }),
			],
		});

		// 600 Action1 x 0.2 = 120 credits: more than base's 100.
		const overBase = await autumnV2_3.check<CheckResponseV3>({
			customer_id: customerId,
			feature_id: TestFeature.Action1,
			required_balance: 600,
		});
		expect(overBase.allowed).toBe(false);

		await autumnV1.track({
			customer_id: customerId,
			feature_id: TestFeature.Action1,
			value: 500,
		});

		const afterDrain = await autumnV2_3.check<CheckResponseV3>({
			customer_id: customerId,
			feature_id: TestFeature.Action1,
		});
		expect(afterDrain.allowed).toBe(false);

		await autumnV1.track({
			customer_id: customerId,
			feature_id: TestFeature.Action1,
			value: 100,
		});

		await expectCreditsRemainingByPlan({
			autumn: autumnV2_3,
			customerId,
			remainingByPlan: { [base.id]: 0, [addOn.id]: 1_000 },
		});
	},
);

test.concurrent(
	`${chalk.yellowBright("multi-row credit override: a loose grant funds a feature the plan excludes, at the catalog rate")}`,
	async () => {
		const plan = products.base({
			id: "base",
			items: [creditsItem({ grant: 100, featureOverride: excludesAction1 })],
		});

		const { customerId, autumnV1, autumnV2_3, autumnV2_4 } = await initScenario(
			{
				customerId: "override-multi-row-loose-grant",
				setup: [s.customer({ testClock: false }), s.products({ list: [plan] })],
				actions: [s.attach({ productId: plan.id })],
			},
		);
		await autumnV2_4.balances.create({
			customer_id: customerId,
			feature_id: TestFeature.Credits,
			included_grant: 50,
		});

		await autumnV1.track({
			customer_id: customerId,
			feature_id: TestFeature.Action1,
			value: 100,
		});

		// 100 x 0.2 = 20 credits, all from the loose grant.
		await expectCreditsRemainingByPlan({
			autumn: autumnV2_3,
			customerId,
			remainingByPlan: { [plan.id]: 100, null: 30 },
		});
	},
);
