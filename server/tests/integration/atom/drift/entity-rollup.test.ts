/**
 * A customer whose balance is split between its own plan and its entities' plans: what the Atom answers for the customer
 * and for each entity, against what the API answers for the same check, after deductions on either path.
 *
 * Setup: the customer's plan grants 100 messages, each of two entities' plans 50.
 *
 * Contract: the Atom answers a check with exactly the API's reply, for the customer and for each entity:
 *  1. before any deduction, at every required balance around each grant boundary;
 *  2. after a customer-level track of 120 sent to the Atom (it may leave it to the API) and an entity's own track of 20
 *     on the API.
 */

import { afterAll, expect, test } from "bun:test";
import { TestFeature } from "@tests/setup/v2Features.js";
import { isBalanceWorkerRoute } from "@tests/utils/balanceWorkerRouteTestUtils.js";
import { items } from "@tests/utils/fixtures/items.js";
import { products } from "@tests/utils/fixtures/products.js";
import defaultCtx from "@tests/utils/testInitUtils/createTestContext.js";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario.js";
import chalk from "chalk";
import type { AutumnInt } from "@/external/autumn/autumnCli.js";
import { expectBalanceCorrect } from "../../utils/expectBalanceCorrect.js";
import { atomTestClient } from "../utils/atomTestClient.js";
import {
	atomIsHosted,
	deleteAtomDeployment,
	ensureAtomDeployment,
	type TestAtom,
} from "../utils/ensureAtomDeployment.js";
import { expectAtomCheckCorrect } from "../utils/expectAtomCheckCorrect.js";
import { trackOnAtom } from "../utils/trackOnAtom.js";

const autumn = atomTestClient();

afterAll(async () => {
	await deleteAtomDeployment({ autumn });
});

/** Every subject, at each grant boundary: one bucket, both levels, and just past each. */
const BOUNDARIES = [50, 51, 100, 101, 150, 151, 200, 201];

const initMixedCustomer = async ({ customerId }: { customerId: string }) => {
	const customerPlan = products.base({
		id: "customer-plan",
		items: [items.monthlyMessages({ includedUsage: 100 })],
	});
	const entityPlan = products.base({
		id: "entity-plan",
		items: [items.monthlyMessages({ includedUsage: 50 })],
	});
	const scenario = await initScenario({
		customerId,
		setup: [
			s.customer({ testClock: false }),
			s.products({ list: [customerPlan, entityPlan] }),
			s.entities({ count: 2, featureId: TestFeature.Users }),
		],
		actions: [
			s.attach({ productId: customerPlan.id }),
			s.attach({ productId: entityPlan.id, entityIndex: 0 }),
			s.attach({ productId: entityPlan.id, entityIndex: 1 }),
		],
	});
	const atom = await ensureAtomDeployment({ autumn });
	return {
		...scenario,
		atom,
		entityIds: scenario.entities.map((entity) => entity.id),
	};
};

/** The Atom answers this check itself, with exactly the reply the API gives to the same check. */
const expectAtomAgrees = async ({
	atom,
	api,
	customerId,
	entityId,
	requiredBalance,
}: {
	atom: TestAtom;
	api: AutumnInt;
	customerId: string;
	entityId?: string;
	requiredBalance: number;
}) => {
	const apiAnswer: { allowed: boolean } = await api.post("/balances.check", {
		customer_id: customerId,
		entity_id: entityId,
		feature_id: TestFeature.Messages,
		required_balance: requiredBalance,
	});
	await expectAtomCheckCorrect({
		atom,
		api,
		secretKey: defaultCtx.orgSecretKey,
		customerId,
		entityId,
		featureId: TestFeature.Messages,
		requiredBalance,
		allowed: apiAnswer.allowed,
		timeoutMs: 15_000,
	});
};

const expectAtomAgreesEverywhere = async (params: {
	atom: TestAtom;
	api: AutumnInt;
	customerId: string;
	entityIds: string[];
}) => {
	for (const entityId of [undefined, ...params.entityIds])
		for (const requiredBalance of BOUNDARIES)
			await expectAtomAgrees({ ...params, entityId, requiredBalance });
};

test.skipIf(!isBalanceWorkerRoute() || atomIsHosted())(
	`${chalk.yellowBright("entity-rollup1: the Atom answers the customer and each entity at every grant boundary as the API does")}`,
	async () => {
		const customerId = "entity-rollup1";
		const { atom, autumnV2_6, entityIds } = await initMixedCustomer({
			customerId,
		});

		await expectAtomAgreesEverywhere({
			atom,
			api: autumnV2_6,
			customerId,
			entityIds,
		});
	},
	240_000,
);

test.skipIf(!isBalanceWorkerRoute() || atomIsHosted())(
	`${chalk.yellowBright("entity-rollup2: after a customer track sent to the Atom and an entity track on the API, both paths answer every subject alike")}`,
	async () => {
		const customerId = "entity-rollup2";
		const { atom, autumnV2_6, entityIds } = await initMixedCustomer({
			customerId,
		});

		const tracked = await trackOnAtom({
			atom,
			customerId,
			featureId: TestFeature.Messages,
			value: 120,
		});
		expect(tracked.status).toBe(202);
		// Applied once the customer's own bucket is spent: a customer-level track draws only it.
		await expectBalanceCorrect({
			customerId,
			featureId: TestFeature.Messages,
			remaining: 0,
		});
		await autumnV2_6.track({
			customer_id: customerId,
			entity_id: entityIds[1],
			feature_id: TestFeature.Messages,
			value: 20,
			async: false,
		});

		await expectAtomAgreesEverywhere({
			atom,
			api: autumnV2_6,
			customerId,
			entityIds,
		});
	},
	240_000,
);
