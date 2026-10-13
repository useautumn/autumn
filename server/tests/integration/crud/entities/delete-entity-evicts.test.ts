/**
 * Deleting an entity by its id alone (`entities.delete` with no customer_id) evicts it from its balance worker.
 *
 * Red: the route resolves the customer itself but never names it on the request, so nothing evicts the worker,
 * which keeps the entity's rows resident. Green: the entity delete evicts the worker itself once it commits.
 */

import { test } from "bun:test";
import type { AttachParamsV1Input } from "@autumn/shared";
import { TestFeature } from "@tests/setup/v2Features.js";
import { isBalanceWorkerRoute } from "@tests/utils/balanceWorkerRouteTestUtils.js";
import { expectWorkerHoldsNoSubject } from "@tests/utils/expectWorkerHoldsNoSubject.js";
import { items } from "@tests/utils/fixtures/items.js";
import { products } from "@tests/utils/fixtures/products.js";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario.js";
import chalk from "chalk";

test.concurrent.skipIf(!isBalanceWorkerRoute())(
	`${chalk.yellowBright("delete-entity-evicts: an entity deleted by its id alone leaves its worker")}`,
	async () => {
		const free = products.base({
			id: "free",
			items: [items.monthlyMessages({ includedUsage: 100 })],
		});
		const { customerId, ctx, autumnV2_4 } = await initScenario({
			customerId: "delete-entity-evicts",
			setup: [s.customer({ testClock: false }), s.products({ list: [free] })],
			actions: [],
		});
		// An id unique to the customer, so it can be deleted by its id alone.
		const entityId = `${customerId}-ent-1`;
		await autumnV2_4.entities.create(customerId, [
			{ id: entityId, name: entityId, feature_id: TestFeature.Users },
		]);
		await autumnV2_4.billing.attach<AttachParamsV1Input>({
			customer_id: customerId,
			entity_id: entityId,
			plan_id: free.id,
		});
		// The track makes the entity resident on its worker.
		await autumnV2_4.track({
			customer_id: customerId,
			entity_id: entityId,
			feature_id: TestFeature.Messages,
			value: 10,
		});

		await autumnV2_4.post("/entities.delete", { entity_id: entityId });

		await expectWorkerHoldsNoSubject({
			org: ctx.org,
			env: ctx.env,
			customerId,
			entityId,
		});
	},
	120_000,
);
