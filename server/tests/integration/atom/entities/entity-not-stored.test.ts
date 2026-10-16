/**
 * An entity the Atom does not hold yet, against the same request on the API.
 *
 * Contract:
 *  1. a check (deducting or not) for an entity that does not exist is forwarded with entity_not_stored, and its reply is
 *     the API's for the same request;
 *  2. once the entity is created and pushed, the Atom answers it itself: a send_event on it deducts on the Atom with
 *     the API's reply, and Postgres ends where the API's customer ends.
 *
 * Green on dev: the non-deducting forward (entity_not_stored). Red on dev: the deducting check is forwarded for
 * send_event, before the entity is ever looked up, and stays forwarded once the entity exists.
 */

import { test } from "bun:test";
import { TestFeature } from "@tests/setup/v2Features.js";
import { items } from "@tests/utils/fixtures/items.js";
import { products } from "@tests/utils/fixtures/products.js";
import defaultCtx from "@tests/utils/testInitUtils/createTestContext.js";
import chalk from "chalk";
import { expectAutumnLockState } from "../utils/autumnLockState.js";
import { initEntityPair } from "../utils/entityPair/initEntityPair.js";
import {
	checkPair,
	expectAtomViewConverged,
} from "../utils/entityPair/pairReplies.js";
import { expectAtomCheckCorrect } from "../utils/expectAtomCheckCorrect.js";
import { expectPostgresBalancesEqual } from "../utils/postgresEntityBalances.js";
import {
	replicaSetRunsHere,
	useReplicaSet,
} from "../utils/replicaSet/useReplicaSet.js";

const replicaSet = useReplicaSet({ size: 1 });

const NEW_ENTITY_ID = "ent-new";

test.skipIf(!replicaSetRunsHere)(
	`${chalk.yellowBright("entity-not-stored1: a check for an entity that does not exist is forwarded as entity_not_stored with the API's reply")}`,
	async () => {
		const pair = await initEntityPair({
			pairId: "entity-not-stored1",
			atom: replicaSet,
			entityCount: 1,
			makeProducts: () => [
				products.base({
					id: "free",
					items: [items.monthlyMessages({ includedUsage: 100 })],
				}),
			],
			attaches: [{ productId: "free" }],
		});
		const messages = {
			pair,
			entityId: NEW_ENTITY_ID,
			featureId: TestFeature.Messages,
			requiredBalance: 10,
			forwarded: "entity_not_stored",
		};

		await checkPair(messages);
		await checkPair({ ...messages, sendEvent: true });
	},
	120_000,
);

test.skipIf(!replicaSetRunsHere)(
	`${chalk.yellowBright("entity-not-stored2: once a new entity exists and is pushed, the Atom deducts its send_event itself")}`,
	async () => {
		const pair = await initEntityPair({
			pairId: "entity-not-stored2",
			atom: replicaSet,
			entityCount: 1,
			makeProducts: () => [
				products.base({
					id: "free",
					items: [
						items.monthlyMessages({ includedUsage: 100 }),
						items.monthlyMessages({
							includedUsage: 20,
							entityFeatureId: TestFeature.Users,
						}),
					],
				}),
			],
			attaches: [{ productId: "free" }],
		});
		for (const customerId of [pair.apiCustomerId, pair.atomCustomerId])
			await pair.autumn.entities.create(customerId, [
				{
					id: NEW_ENTITY_ID,
					name: NEW_ENTITY_ID,
					feature_id: TestFeature.Users,
				},
			]);
		await expectAtomCheckCorrect({
			atom: pair.atom,
			secretKey: defaultCtx.orgSecretKey,
			customerId: pair.atomCustomerId,
			entityId: NEW_ENTITY_ID,
			featureId: TestFeature.Messages,
			requiredBalance: 1,
			allowed: true,
		});

		await checkPair({
			pair,
			entityId: NEW_ENTITY_ID,
			featureId: TestFeature.Messages,
			requiredBalance: 30,
			sendEvent: true,
		});

		await expectAutumnLockState({
			customerId: pair.atomCustomerId,
			openLockIds: [],
			atomSeqs: [1],
		});
		await expectPostgresBalancesEqual({
			apiCustomerId: pair.apiCustomerId,
			atomCustomerId: pair.atomCustomerId,
		});
		await expectAtomViewConverged({
			pair: { ...pair, entityIds: [...pair.entityIds, NEW_ENTITY_ID] },
			featureId: TestFeature.Messages,
		});
	},
	120_000,
);
