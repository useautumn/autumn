/**
 * An entity's send_event on the Atom at its limits, retried, and in parallel, against the same scenario on the API.
 *
 * Contract:
 *  1. once an entity's own per-entity balance (an entityFeatureId item) is spent, its send_event and its lock are the
 *     API's deny, deduct nothing and journal nothing: the Atom's customer keeps only its first seq;
 *  2. a send_event sent twice under one Idempotency-Key: the second is the API's 409, and one deduction lands;
 *  3. twenty send_events in parallel, split across two entities: every one allowed, the final balances exact and equal
 *     to the API path run the same way, and twenty seqs landed.
 *
 * Red on dev: the Atom forwards every entity send_event and lock (x-atom-forwarded: send_event, lock).
 */

import { expect, test } from "bun:test";
import { TestFeature } from "@tests/setup/v2Features.js";
import { items } from "@tests/utils/fixtures/items.js";
import { products } from "@tests/utils/fixtures/products.js";
import chalk from "chalk";
import { expectAutumnLockState } from "../utils/autumnLockState.js";
import { initEntityPair } from "../utils/entityPair/initEntityPair.js";
import {
	checkOnApi,
	checkOnPairAtom,
	checkPair,
	expectAtomViewConverged,
	expectSameReply,
} from "../utils/entityPair/pairReplies.js";
import { expectPostgresBalancesEqual } from "../utils/postgresEntityBalances.js";
import {
	replicaSetRunsHere,
	useReplicaSet,
} from "../utils/replicaSet/useReplicaSet.js";

const replicaSet = useReplicaSet({ size: 1 });

/** 100 messages the customer's entities share, and 5 more each entity holds alone. */
const pooledAndPerEntity = () => [
	products.base({
		id: "free",
		items: [
			items.monthlyMessages({ includedUsage: 100 }),
			items.monthlyMessages({
				includedUsage: 5,
				entityFeatureId: TestFeature.Users,
			}),
		],
	}),
];

test.skipIf(!replicaSetRunsHere)(
	`${chalk.yellowBright("entity-limits1: past an entity's own per-entity balance, its send_event and lock are the API's deny and journal nothing")}`,
	async () => {
		const pair = await initEntityPair({
			pairId: "entity-limits1",
			atom: replicaSet,
			makeProducts: () => [
				products.base({
					id: "free",
					items: [
						items.monthlyMessages({
							includedUsage: 50,
							entityFeatureId: TestFeature.Users,
						}),
					],
				}),
			],
			attaches: [{ productId: "free" }],
		});
		const [ent1] = pair.entityIds;
		const messages = { pair, featureId: TestFeature.Messages };

		await checkPair({
			...messages,
			entityId: ent1,
			requiredBalance: 40,
			sendEvent: true,
		});
		// ent-1 holds 10; ent-2's 50 is never ent-1's.
		const denied = await checkPair({
			...messages,
			entityId: ent1,
			requiredBalance: 20,
			sendEvent: true,
		});
		await checkPair({
			...messages,
			entityId: ent1,
			requiredBalance: 11,
			lock: { enabled: true, name: "over" },
		});

		expect(denied.atom.body).toMatchObject({ allowed: false });
		await expectAutumnLockState({
			customerId: pair.atomCustomerId,
			openLockIds: [],
			atomSeqs: [1],
		});
		await expectPostgresBalancesEqual({
			apiCustomerId: pair.apiCustomerId,
			atomCustomerId: pair.atomCustomerId,
		});
		await expectAtomViewConverged({ pair, featureId: TestFeature.Messages });
	},
	180_000,
);

test.skipIf(!replicaSetRunsHere)(
	`${chalk.yellowBright("entity-limits2: an entity's send_event sent twice under one Idempotency-Key is the API's 409 the second time; one deduction lands")}`,
	async () => {
		const pair = await initEntityPair({
			pairId: "entity-limits2",
			atom: replicaSet,
			makeProducts: pooledAndPerEntity,
			attaches: [{ productId: "free" }],
		});
		const check = {
			entityId: pair.entityIds[0],
			featureId: TestFeature.Messages,
			requiredBalance: 10,
			sendEvent: true,
		};
		// Unique per run: the API's claim outlives the customer the pair recreates.
		const run = Date.now();
		const keyed = (customerId: string) => ({
			...check,
			idempotencyKey: `${customerId}-key-${run}`,
		});

		for (let attempt = 0; attempt < 2; attempt++) {
			const [api, atom] = await Promise.all([
				checkOnApi({ pair, check: keyed(pair.apiCustomerId) }),
				checkOnPairAtom({ pair, check: keyed(pair.atomCustomerId) }),
			]);
			expect(atom.forwarded).toBeNull();
			expectSameReply({ pair, api, atom });
		}

		await expectAutumnLockState({
			customerId: pair.atomCustomerId,
			openLockIds: [],
			atomSeqs: [1],
		});
		await expectPostgresBalancesEqual({
			apiCustomerId: pair.apiCustomerId,
			atomCustomerId: pair.atomCustomerId,
		});
		await expectAtomViewConverged({ pair, featureId: TestFeature.Messages });
	},
	180_000,
);

const PARALLEL_CHECKS = 20;
const PARALLEL_VALUE = 3;

test.skipIf(!replicaSetRunsHere)(
	`${chalk.yellowBright("entity-limits3: twenty send_events in parallel across two entities land exactly, as the API's do")}`,
	async () => {
		const pair = await initEntityPair({
			pairId: "entity-limits3",
			atom: replicaSet,
			makeProducts: pooledAndPerEntity,
			attaches: [{ productId: "free" }],
		});
		// Each entity draws 30: its own 5 first, then 25 of the shared pool, whatever the order.
		const checks = Array.from({ length: PARALLEL_CHECKS }, (_, index) => ({
			entityId: pair.entityIds[index % 2],
			featureId: TestFeature.Messages,
			requiredBalance: PARALLEL_VALUE,
			sendEvent: true,
		}));

		const [apiReplies, atomReplies] = await Promise.all([
			Promise.all(checks.map((check) => checkOnApi({ pair, check }))),
			Promise.all(checks.map((check) => checkOnPairAtom({ pair, check }))),
		]);

		expect(atomReplies.map(({ forwarded }) => forwarded)).toEqual(
			checks.map(() => null),
		);
		for (const replies of [apiReplies, atomReplies])
			expect(
				replies.map(({ status, body }) => ({
					status,
					allowed: (body as { allowed: boolean }).allowed,
				})),
			).toEqual(checks.map(() => ({ status: 200, allowed: true })));
		await expectAutumnLockState({
			customerId: pair.atomCustomerId,
			openLockIds: [],
			atomSeqs: [PARALLEL_CHECKS],
		});
		const settled = await expectPostgresBalancesEqual({
			apiCustomerId: pair.apiCustomerId,
			atomCustomerId: pair.atomCustomerId,
		});
		expect(
			settled.balances.map(({ balance, entities }) => ({ balance, entities })),
		).toEqual([
			{ balance: 50, entities: null },
			{ balance: expect.any(Number), entities: { "ent-1": 0, "ent-2": 0 } },
		]);
		await expectAtomViewConverged({ pair, featureId: TestFeature.Messages });
	},
	180_000,
);
