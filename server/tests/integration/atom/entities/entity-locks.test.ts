/**
 * A lock on an entity taken on the Atom and finalized through it, against the same scenario on the API.
 *
 * Contract: an entity lock is taken on the Atom (no forward) with the API's reply; it hands in with its seq and lands one
 * balance_locks row on the entity; once its push lands the Atom's view holds it as the API's does; the finalize goes
 * through the Atom's journal, settles the lock's own entity exactly as the API's finalize does (seq 2, no lock left), and
 * the Atom's view converges. One pair per finalize:
 *  1. confirm, keeping what was locked;
 *  2. confirm with an override below the lock, giving the rest back to the entity;
 *  3. confirm with an override above the lock, drawing the rest as the lock's overage behaviour allows;
 *  4. release, giving every unit back.
 *
 * Red on dev: the Atom forwards every entity lock (x-atom-forwarded: lock).
 */

import { test } from "bun:test";
import { TestFeature } from "@tests/setup/v2Features.js";
import chalk from "chalk";
import { expectAutumnLockState } from "../utils/autumnLockState.js";
import {
	initPerEntityLockPair,
	LOCKED,
	settleEntityLockPair,
} from "../utils/entityPair/entityLockPair.js";
import { checkPair } from "../utils/entityPair/pairReplies.js";
import {
	replicaSetRunsHere,
	useReplicaSet,
} from "../utils/replicaSet/useReplicaSet.js";

const replicaSet = useReplicaSet({ size: 1 });

const lockOnEntity = async ({
	pair,
}: {
	pair: Awaited<ReturnType<typeof initPerEntityLockPair>>;
}) => {
	await checkPair({
		pair,
		entityId: pair.entityIds[0],
		featureId: TestFeature.Messages,
		requiredBalance: LOCKED,
		lock: { enabled: true, name: "lock" },
	});
	await expectAutumnLockState({
		customerId: pair.atomCustomerId,
		openLockIds: [`${pair.atomCustomerId}-lock`],
		atomSeqs: [1],
	});
};

const finalizes = [
	["confirm", { action: "confirm" }],
	["override-lower", { action: "confirm", overrideValue: 10 }],
	["override-higher", { action: "confirm", overrideValue: 80 }],
	["release", { action: "release" }],
] as const;

for (const [index, [name, finalize]] of finalizes.entries()) {
	const pairId = `entity-locks${index + 1}`;
	test.skipIf(!replicaSetRunsHere)(
		`${chalk.yellowBright(`${pairId}: an entity lock taken on the Atom, then ${name} through it, settles the entity as the API's does`)}`,
		async () => {
			const pair = await initPerEntityLockPair({ pairId, atom: replicaSet });
			await lockOnEntity({ pair });

			await settleEntityLockPair({ pair, finalize });
		},
		180_000,
	);
}
