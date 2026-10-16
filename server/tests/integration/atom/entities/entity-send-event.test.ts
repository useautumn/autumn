/**
 * An entity's send_event on the Atom, against the same scenario on the API: two customers set up alike, one driven
 * through the API and one through the Atom.
 *
 * Contract:
 *  1. a send_event for an entity on the entity's own plan is deducted on the Atom (no forward), with the API's reply at
 *     every step: the entity's own balance first, then the customer's;
 *  2. a send_event for an entity on a customer-level feature draws on the customer's pool, shared by its entities; a
 *     deny is the API's deny and journals nothing;
 *  3. a send_event of an action feature mapped to per-entity credits deducts the entity's credits at the action's rate;
 *  for each, the Atom's deductions hand in with their seqs, Postgres ends exactly where the API's customer ends, and the
 *  Atom's own view converges on the API's answer.
 *
 * Red on dev: the Atom forwards every entity send_event (x-atom-forwarded: send_event).
 */

import { test } from "bun:test";
import { TestFeature } from "@tests/setup/v2Features.js";
import { items } from "@tests/utils/fixtures/items.js";
import { products } from "@tests/utils/fixtures/products.js";
import chalk from "chalk";
import { constructFeatureItem } from "@/utils/scriptUtils/constructItem.js";
import { expectAutumnLockState } from "../utils/autumnLockState.js";
import { initEntityPair } from "../utils/entityPair/initEntityPair.js";
import {
	checkPair,
	expectAtomViewConverged,
} from "../utils/entityPair/pairReplies.js";
import { expectPostgresBalancesEqual } from "../utils/postgresEntityBalances.js";
import {
	replicaSetRunsHere,
	useReplicaSet,
} from "../utils/replicaSet/useReplicaSet.js";

const replicaSet = useReplicaSet({ size: 1 });

/** The Atom handed in exactly `deductions` entries for the customer, the pair's balances match, and its view converged. */
const expectSettledLikeApi = async ({
	pair,
	deductions,
	featureIds,
}: {
	pair: Awaited<ReturnType<typeof initEntityPair>>;
	deductions: number;
	featureIds: string[];
}) => {
	await expectAutumnLockState({
		customerId: pair.atomCustomerId,
		openLockIds: [],
		atomSeqs: [deductions],
	});
	await expectPostgresBalancesEqual({
		apiCustomerId: pair.apiCustomerId,
		atomCustomerId: pair.atomCustomerId,
	});
	for (const featureId of featureIds)
		await expectAtomViewConverged({ pair, featureId });
};

test.skipIf(!replicaSetRunsHere)(
	`${chalk.yellowBright("entity-send-event1: an entity's send_event on its own plan is deducted on the Atom, own balance first, as the API deducts it")}`,
	async () => {
		const pair = await initEntityPair({
			pairId: "entity-send-event1",
			atom: replicaSet,
			makeProducts: () => [
				products.base({
					id: "customer-prod",
					items: [items.monthlyMessages({ includedUsage: 100 })],
				}),
				products.base({
					id: "entity-prod",
					items: [items.monthlyMessages({ includedUsage: 50 })],
				}),
			],
			attaches: [
				{ productId: "customer-prod" },
				{ productId: "entity-prod", entityIndex: 0 },
				{ productId: "entity-prod", entityIndex: 1 },
			],
		});
		const [ent1, ent2] = pair.entityIds;
		const messages = {
			pair,
			featureId: TestFeature.Messages,
			sendEvent: true,
		};

		await checkPair({ ...messages, entityId: ent1, requiredBalance: 30 });
		// ent-1's own 20 left, then 10 from the customer's pool.
		await checkPair({ ...messages, entityId: ent1, requiredBalance: 30 });
		await checkPair({ ...messages, entityId: ent2, requiredBalance: 10 });

		await expectSettledLikeApi({
			pair,
			deductions: 3,
			featureIds: [TestFeature.Messages],
		});
	},
	180_000,
);

test.skipIf(!replicaSetRunsHere)(
	`${chalk.yellowBright("entity-send-event2: entities' send_events on a customer-level feature draw on the customer's pool; a deny is the API's and journals nothing")}`,
	async () => {
		const pair = await initEntityPair({
			pairId: "entity-send-event2",
			atom: replicaSet,
			makeProducts: () => [
				products.base({
					id: "free",
					items: [items.monthlyMessages({ includedUsage: 100 })],
				}),
			],
			attaches: [{ productId: "free" }],
		});
		const [ent1, ent2] = pair.entityIds;
		const messages = {
			pair,
			featureId: TestFeature.Messages,
			sendEvent: true,
		};

		await checkPair({ ...messages, entityId: ent1, requiredBalance: 30 });
		await checkPair({ ...messages, entityId: ent2, requiredBalance: 30 });
		// 40 left in the pool: denied, nothing deducted.
		await checkPair({ ...messages, entityId: ent1, requiredBalance: 50 });
		await checkPair({ ...messages, entityId: ent2, requiredBalance: 40 });

		await expectSettledLikeApi({
			pair,
			deductions: 3,
			featureIds: [TestFeature.Messages],
		});
	},
	180_000,
);

test.skipIf(!replicaSetRunsHere)(
	`${chalk.yellowBright("entity-send-event3: an action's send_event on an entity deducts the entity's own credits at the action's rate")}`,
	async () => {
		const pair = await initEntityPair({
			pairId: "entity-send-event3",
			atom: replicaSet,
			featureId: TestFeature.Action1,
			makeProducts: () => [
				products.base({
					id: "free",
					items: [
						constructFeatureItem({
							featureId: TestFeature.Credits,
							includedUsage: 100,
							entityFeatureId: TestFeature.Users,
						}),
					],
				}),
			],
			attaches: [{ productId: "free" }],
		});
		const [ent1, ent2] = pair.entityIds;
		const action1 = {
			pair,
			featureId: TestFeature.Action1,
			sendEvent: true,
		};

		// Action1 costs 0.2 credits: 10, then 90 more, which leaves ent-1 none.
		await checkPair({ ...action1, entityId: ent1, requiredBalance: 50 });
		await checkPair({ ...action1, entityId: ent1, requiredBalance: 450 });
		await checkPair({ ...action1, entityId: ent1, requiredBalance: 5 });
		await checkPair({ ...action1, entityId: ent2, requiredBalance: 100 });

		await expectSettledLikeApi({
			pair,
			deductions: 3,
			featureIds: [TestFeature.Action1, TestFeature.Credits],
		});
	},
	180_000,
);
