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
		const entityId = `${customerId}-ent-1`;
		await autumnV2_4.entities.create(customerId, [
			{ id: entityId, name: entityId, feature_id: TestFeature.Users },
		]);
		await autumnV2_4.billing.attach<AttachParamsV1Input>({
			customer_id: customerId,
			entity_id: entityId,
			plan_id: free.id,
		});
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
