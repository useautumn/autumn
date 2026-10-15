/**
 * Which grants share a `combine` pool: pool grouping is unchanged, separate
 * pools add up, and entity grants never compete.
 *
 * Contract:
 *   - A never-resetting value on a free plan and a paid plan shares one pool,
 *     so min applies (PRD case 13).
 *   - A monthly value on a free plan and a paid plan lands in two pools that
 *     add up (PRD case 14).
 *   - Entity grants keep adding up (decision 3): a pooled entity item adds on
 *     top of the customer-level winner, an unpooled one stays the entity's own.
 *   - A `sum` feature adds up as today (PRD case 18).
 */

import { expect, test } from "bun:test";
import type { ApiCustomerV5, AttachParamsV1Input } from "@autumn/shared";
import { expectBalanceCorrect } from "@tests/integration/utils/expectBalanceCorrect.js";
import { TestFeature } from "@tests/setup/v2Features.js";
import { items } from "@tests/utils/fixtures/items.js";
import { products } from "@tests/utils/fixtures/products.js";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario.js";
import chalk from "chalk";
import { constructFeatureItem } from "@/utils/scriptUtils/constructItem.js";
import { getPooledBalanceDbState } from "../utils/getPooledBalanceDbState.js";
import { expectCombinePoolCorrect } from "./utils/expectCombinePoolCorrect.js";

test.concurrent(
	chalk.yellowBright("combine: never-resetting free + paid share a pool"),
	async () => {
		const customerId = "combine-pools-lifetime-free-paid";
		const featureId = TestFeature.CombineMinHours;
		const free = products.base({
			id: "combine-pools-lifetime-free",
			isAddOn: true,
			items: [
				constructFeatureItem({ featureId, includedUsage: 48, interval: null }),
			],
		});
		const pro = products.pro({
			id: "combine-pools-lifetime-pro",
			items: [
				constructFeatureItem({ featureId, includedUsage: 24, interval: null }),
			],
		});

		const { autumnV2_3, ctx } = await initScenario({
			customerId,
			setup: [
				s.customer({ paymentMethod: "success" }),
				s.products({ list: [free, pro] }),
			],
			actions: [
				s.billing.attach({ productId: free.id }),
				s.billing.attach({ productId: pro.id }),
			],
		});

		await expectCombinePoolCorrect({
			db: ctx.db,
			customerId,
			featureId,
			granted: 24,
			competingContributions: [24, 48],
		});
		await expectBalanceCorrect({
			customerId,
			autumn: autumnV2_3,
			featureId,
			granted: 24,
		});
	},
);

test.concurrent(
	chalk.yellowBright(
		"combine: monthly free + paid are separate pools that add up",
	),
	async () => {
		const customerId = "combine-pools-monthly-free-paid";
		const featureId = TestFeature.CombineMaxMessages;
		const free = products.base({
			id: "combine-pools-monthly-free",
			isAddOn: true,
			items: [constructFeatureItem({ featureId, includedUsage: 1000 })],
		});
		const pro = products.pro({
			id: "combine-pools-monthly-pro",
			items: [constructFeatureItem({ featureId, includedUsage: 5000 })],
		});

		const { autumnV2_3, ctx } = await initScenario({
			customerId,
			setup: [
				s.customer({ paymentMethod: "success" }),
				s.products({ list: [free, pro] }),
			],
			actions: [
				s.billing.attach({ productId: free.id }),
				s.billing.attach({ productId: pro.id }),
			],
		});

		await expectCombinePoolCorrect({
			db: ctx.db,
			customerId,
			featureId,
			poolCount: 2,
		});
		await expectBalanceCorrect({
			customerId,
			autumn: autumnV2_3,
			featureId,
			granted: 6000,
			remaining: 6000,
		});
	},
);

test.concurrent(
	chalk.yellowBright(
		"combine: entity grants add up, customer-level grants compete",
	),
	async () => {
		const customerId = "combine-pools-entities";
		const featureId = TestFeature.CombineMaxMessages;
		const main = products.base({
			id: "combine-pools-entities-main",
			items: [constructFeatureItem({ featureId, includedUsage: 1000 })],
		});
		const addOn = products.base({
			id: "combine-pools-entities-addon",
			isAddOn: true,
			items: [constructFeatureItem({ featureId, includedUsage: 5000 })],
		});
		const pooledWorkspace = products.base({
			id: "combine-pools-entities-pooled-ws",
			group: "combine-pools-entities-ws",
			items: [
				{
					...constructFeatureItem({ featureId, includedUsage: 100 }),
					pooled: true,
				},
			],
		});
		const privateWorkspace = products.base({
			id: "combine-pools-entities-private-ws",
			group: "combine-pools-entities-private",
			items: [constructFeatureItem({ featureId, includedUsage: 100 })],
		});

		const { autumnV2_3, ctx, entities } = await initScenario({
			customerId,
			setup: [
				s.customer({ testClock: false }),
				s.entities({ count: 3, featureId: TestFeature.Users }),
				s.products({ list: [main, addOn, pooledWorkspace, privateWorkspace] }),
			],
			actions: [
				s.billing.attach({ productId: main.id }),
				s.billing.attach({ productId: addOn.id }),
				s.billing.attach({ productId: pooledWorkspace.id, entityIndex: 0 }),
				s.billing.attach({ productId: pooledWorkspace.id, entityIndex: 1 }),
			],
		});

		// Best customer-level grant (5,000) plus each pooled workspace's 100.
		await expectCombinePoolCorrect({
			db: ctx.db,
			customerId,
			featureId,
			granted: 5200,
			balance: 5200,
			competingContributions: [1000, 5000],
			addingContributions: [100, 100],
		});

		// An unpooled workspace grant stays the entity's own.
		await autumnV2_3.billing.attach<AttachParamsV1Input>({
			customer_id: customerId,
			entity_id: entities[2].id,
			plan_id: privateWorkspace.id,
		});
		const state = await getPooledBalanceDbState({ db: ctx.db, customerId });
		const privateSource = state.sourceCustomerProducts
			.find(({ product_id }) => product_id === privateWorkspace.id)
			?.customer_entitlements.find(
				(customerEntitlement) => customerEntitlement.feature_id === featureId,
			);
		expect(privateSource?.pooled_contribution_id).toBeNull();
		expect(privateSource?.balance).toBe(100);
		await expectCombinePoolCorrect({
			db: ctx.db,
			customerId,
			featureId,
			granted: 5200,
		});
	},
);

test.concurrent(
	chalk.yellowBright("combine sum (default): grants add up as today"),
	async () => {
		const customerId = "combine-sum-default";
		const planA = products.base({
			id: "combine-sum-default-a",
			items: [items.monthlyMessages({ includedUsage: 1000 })],
		});
		const planB = products.base({
			id: "combine-sum-default-b",
			isAddOn: true,
			items: [items.monthlyMessages({ includedUsage: 5000 })],
		});

		const { autumnV2_3, ctx } = await initScenario({
			customerId,
			setup: [
				s.customer({ testClock: false }),
				s.products({ list: [planA, planB] }),
			],
			actions: [
				s.billing.attach({ productId: planA.id }),
				s.billing.attach({ productId: planB.id }),
			],
		});

		await expectBalanceCorrect({
			customerId,
			autumn: autumnV2_3,
			featureId: TestFeature.Messages,
			granted: 6000,
			remaining: 6000,
		});
		const state = await getPooledBalanceDbState({ db: ctx.db, customerId });
		expect(state.pools).toHaveLength(0);
		const customer = await autumnV2_3.customers.get<ApiCustomerV5>(customerId);
		expect(customer.balances[TestFeature.Messages]?.breakdown).toHaveLength(2);
	},
);
