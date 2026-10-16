/**
 * An entity's push held back while the customer's push, which already applied that entity's deduction, lands first.
 *
 * Contract: the Atom deducts an entity's send_event itself; the worker settles it and herald pushes the customer's copy
 * and the entity's. While the entity's copy is behind the customer's, the Atom still answers the entity itself with the
 * deduction counted once (its copy replays the owed entry, the customer's already holds it), and the customer too; once
 * the entity's push lands, nothing is owed, and Postgres ends exactly where the API's customer ends.
 *
 * Red on dev: the Atom forwards the entity's send_event (x-atom-forwarded: send_event).
 */

import { expect, test } from "bun:test";
import { TestFeature } from "@tests/setup/v2Features.js";
import { pollUntilAsserted } from "@tests/utils/genUtils.js";
import chalk from "chalk";
import { expectAutumnLockState } from "../utils/autumnLockState.js";
import { initPerEntityLockPair } from "../utils/entityPair/entityLockPair.js";
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

test.skipIf(!replicaSetRunsHere)(
	`${chalk.yellowBright("entity-push-order1: while an entity's push trails its customer's, the Atom still answers both, the entity's deduction counted once")}`,
	async () => {
		const pair = await initPerEntityLockPair({
			pairId: "entity-push-order1",
			atom: replicaSet,
		});
		const [ent1] = pair.entityIds;
		const set = replicaSet();
		const messages = { pair, featureId: TestFeature.Messages };
		set.holdSubjectPushes({
			customerId: pair.atomCustomerId,
			entityId: ent1 ?? null,
		});
		const pushedBefore = set.pushes().length;

		await checkPair({
			...messages,
			entityId: ent1,
			requiredBalance: 30,
			sendEvent: true,
		});
		await pollUntilAsserted({
			fetch: async () => set.pushes().slice(pushedBefore),
			assert: (pushes) =>
				expect(pushes).toContainEqual(
					expect.objectContaining({
						customerId: pair.atomCustomerId,
						entityId: null,
						status: 200,
					}),
				),
		});

		await checkPair({ ...messages, entityId: ent1, requiredBalance: 1 });
		await checkPair({ ...messages, requiredBalance: 1 });

		await set.releasePushes();
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
