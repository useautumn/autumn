/**
 * Deleting an entity takes its customer products with it (prod's FK cascades;
 * the schema in this repo sets them to null), so they must stop feeding the
 * customer's pool. A pool left with no contributor must expire, otherwise it
 * keeps resetting (and rolling over) every cycle.
 *
 * Pre-fix red: the contribution survives the delete and the pool never expires.
 * Post-fix green: they are expired when the last contributor's entity goes,
 * and left live while another entity still contributes.
 */

import { expect, test } from "bun:test";
import { TestFeature } from "@tests/setup/v2Features.js";
import { items } from "@tests/utils/fixtures/items.js";
import { products } from "@tests/utils/fixtures/products.js";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario.js";
import chalk from "chalk";
import { getPooledBalanceDbState } from "../utils/getPooledBalanceDbState.js";

const FIRST_GRANT = 100;
const SECOND_GRANT = 60;

const pooledPlan = ({
	id,
	group,
	grant,
}: {
	id: string;
	group: string;
	grant: number;
}) =>
	products.base({
		id,
		group,
		items: [
			{ ...items.monthlyMessages({ includedUsage: grant }), pooled: true },
		],
	});

test(
	chalk.yellowBright(
		"pooled expiry: deleting the only contributing entity expires the pool",
	),
	async () => {
		const customerId = "pooled-expire-entity-delete-sole";
		const plan = pooledPlan({
			id: "pooled-entity-delete-sole-plan",
			group: "pooled-entity-delete-sole-group",
			grant: FIRST_GRANT,
		});

		const { entities, autumnV1, ctx } = await initScenario({
			customerId,
			setup: [
				s.customer({ testClock: false }),
				s.entities({ count: 1, featureId: TestFeature.Users }),
				s.products({ list: [plan] }),
			],
			actions: [s.billing.attach({ productId: plan.id, entityIndex: 0 })],
		});

		const baseline = await getPooledBalanceDbState({ db: ctx.db, customerId });
		expect(baseline.pools).toHaveLength(1);
		expect(baseline.contributions).toHaveLength(1);
		expect(baseline.pools[0].expires_at).toBeNull();

		await autumnV1.entities.delete(customerId, entities[0].id);

		const afterDelete = await getPooledBalanceDbState({
			db: ctx.db,
			customerId,
		});
		expect(afterDelete.contributions).toHaveLength(0);
		expect(afterDelete.pools).toHaveLength(1);
		expect(afterDelete.pools[0].expires_at).not.toBeNull();
		expect(afterDelete.pools[0].expires_at).toBeLessThanOrEqual(Date.now());

		expect(afterDelete.poolCustomerEntitlements).toHaveLength(1);
		expect(
			afterDelete.poolCustomerEntitlements[0].expires_at,
		).toBeLessThanOrEqual(Date.now());
	},
);

test(
	chalk.yellowBright(
		"pooled expiry: deleting one of several contributing entities keeps the pool live",
	),
	async () => {
		const customerId = "pooled-expire-entity-delete-many";
		const group = "pooled-entity-delete-many-group";
		const firstPlan = pooledPlan({
			id: "pooled-entity-delete-many-first",
			group,
			grant: FIRST_GRANT,
		});
		const secondPlan = pooledPlan({
			id: "pooled-entity-delete-many-second",
			group,
			grant: SECOND_GRANT,
		});

		const { entities, autumnV1, ctx } = await initScenario({
			customerId,
			setup: [
				s.customer({ testClock: false }),
				s.entities({ count: 2, featureId: TestFeature.Users }),
				s.products({ list: [firstPlan, secondPlan] }),
			],
			actions: [
				s.billing.attach({ productId: firstPlan.id, entityIndex: 0 }),
				s.billing.attach({ productId: secondPlan.id, entityIndex: 1 }),
			],
		});

		const baseline = await getPooledBalanceDbState({ db: ctx.db, customerId });
		expect(baseline.pools).toHaveLength(1);
		expect(baseline.contributions).toHaveLength(2);

		await autumnV1.entities.delete(customerId, entities[0].id);

		const afterDelete = await getPooledBalanceDbState({
			db: ctx.db,
			customerId,
		});
		expect(afterDelete.contributions).toHaveLength(1);
		expect(afterDelete.pools).toHaveLength(1);
		expect(afterDelete.pools[0].expires_at).toBeNull();
		expect(afterDelete.poolCustomerEntitlements[0].expires_at).toBeNull();
	},
);
