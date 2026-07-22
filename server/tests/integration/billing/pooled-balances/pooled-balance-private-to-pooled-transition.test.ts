// Contract: an immediate regular-to-pooled entity plan switch carries usage into the synthetic pool.
// A 200-credit pooled grant with 40 carried usage starts at 160 before its source is normalized.

import { expect, test } from "bun:test";
import {
	type ApiEntityV2,
	type AttachParamsV1Input,
	type CheckResponseV3,
	EntInterval,
	PooledBalanceResetMode,
} from "@autumn/shared";
import { expectCustomerProducts } from "@tests/integration/billing/utils/expectCustomerProductCorrect.js";
import { expectNoStripeSubscription } from "@tests/integration/billing/utils/expectNoStripeSubscription.js";
import { expectBalanceCorrect } from "@tests/integration/utils/expectBalanceCorrect.js";
import { TestFeature } from "@tests/setup/v2Features.js";
import { items } from "@tests/utils/fixtures/items.js";
import { products } from "@tests/utils/fixtures/products.js";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario.js";
import chalk from "chalk";
import { expectPooledBalanceCorrect } from "./utils/expectPooledBalanceCorrect.js";

const OLD_GRANT = 100;
const POOLED_GRANT = 200;
const CARRIED_USAGE = 40;

test.concurrent(
	`${chalk.yellowBright("pooled transition: regular entity credits become pooled without resetting usage")}`,
	async () => {
		const regularPlan = products.base({
			id: "regular-credits-before-pool",
			items: [items.monthlyCredits({ includedUsage: OLD_GRANT })],
		});
		const pooledPlan = products.base({
			id: "pooled-credits-after-regular",
			items: [
				{
					...items.monthlyCredits({ includedUsage: POOLED_GRANT }),
					pooled: true,
				},
			],
		});
		const { autumnV2_2, ctx, customerId, entities } = await initScenario({
			customerId: "pooled-transition-private-to-pooled",
			setup: [
				s.customer({ testClock: false }),
				s.entities({ count: 2, featureId: TestFeature.Users }),
				s.products({ list: [regularPlan, pooledPlan] }),
			],
			actions: [
				s.billing.attach({ productId: regularPlan.id, entityIndex: 0 }),
				s.track({
					featureId: TestFeature.Credits,
					value: CARRIED_USAGE,
					entityIndex: 0,
					timeout: 2000,
				}),
			],
		});

		await autumnV2_2.billing.attach<AttachParamsV1Input>({
			customer_id: customerId,
			entity_id: entities[0].id,
			plan_id: pooledPlan.id,
			plan_schedule: "immediate",
			carry_over_usages: { enabled: true },
		});

		const state = await expectPooledBalanceCorrect({
			db: ctx.db,
			customerId,
			pool: {
				balance: POOLED_GRANT - CARRIED_USAGE,
				adjustment: 0,
				granted: POOLED_GRANT,
				interval: EntInterval.Month,
				nextResetAt: "present",
				resetCycleAnchor: "present",
				resetMode: PooledBalanceResetMode.Lazy,
				stripeSubscriptionId: null,
			},
			contributions: {
				count: 1,
				currentContribution: POOLED_GRANT,
				nextCycleContribution: POOLED_GRANT,
			},
			sources: { count: 1, balance: 0, adjustment: 0 },
		});
		const pooledCustomerEntitlement = state.poolCustomerEntitlements[0];

		const entity = await autumnV2_2.entities.get<ApiEntityV2>(
			customerId,
			entities[0].id,
		);
		await expectCustomerProducts({
			customer: entity,
			active: [pooledPlan.id],
			notPresent: [regularPlan.id],
		});
		expectBalanceCorrect({
			customer: entity,
			featureId: TestFeature.Credits,
			granted: POOLED_GRANT,
			includedGrant: POOLED_GRANT,
			remaining: POOLED_GRANT - CARRIED_USAGE,
			usage: CARRIED_USAGE,
			planId: null,
			breakdownCount: 1,
			breakdownId: pooledCustomerEntitlement.id,
		});

		const check = await autumnV2_2.check<CheckResponseV3>({
			customer_id: customerId,
			entity_id: entities[1].id,
			feature_id: TestFeature.Credits,
		});
		expect(check.allowed).toBe(true);
		expect(check.balance).toMatchObject({
			granted: POOLED_GRANT,
			remaining: POOLED_GRANT - CARRIED_USAGE,
			usage: CARRIED_USAGE,
		});

		await expectNoStripeSubscription({
			db: ctx.db,
			customerId,
			org: ctx.org,
			env: ctx.env,
		});
	},
);
