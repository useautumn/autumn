/**
 * An entity lock retried, finalized twice, and finalized on the Atom after Autumn already holds it, against the API.
 *
 * Contract:
 *  1. the same entity lock_id on its own terms is allowed again on the Atom and holds nothing new (one seq, one row;
 *     the API's same-terms retry stays its 409, by design); on other terms it is 409 with the API's code;
 *  2. a finalize of an entity lock retried under one Idempotency-Key is answered success both times on the Atom and
 *     settles once, as the API's finalize settles once;
 *  3. an entity lock taken on the Atom, handed in and pushed back (the Atom's view holds it), then finalized through
 *     the Atom, settles that entity exactly once;
 *  4. an entity lock taken through the API, then finalized through the Atom, settles on the lock's entity: the worker
 *     resolves the lock row and decides on its entity, leaving no lock open.
 *
 * Red on dev: 1 to 3 are forwarded (x-atom-forwarded: lock); 4 is refused at the worker (entity_not_found, the
 * undecided finalize decided on entity null), so the lock stays open until expiry.
 */

import { expect, test } from "bun:test";
import { TestFeature } from "@tests/setup/v2Features.js";
import { timeout } from "@tests/utils/genUtils.js";
import chalk from "chalk";
import { expectAutumnLockState } from "../utils/autumnLockState.js";
import {
	initPerEntityLockPair,
	LOCKED,
	settleEntityLockPair,
} from "../utils/entityPair/entityLockPair.js";
import {
	checkOnApi,
	checkOnPairAtom,
	checkPair,
	expectAtomViewConverged,
	expectSameReply,
	finalizeOnApi,
	finalizeOnPairAtom,
	type PairCheck,
} from "../utils/entityPair/pairReplies.js";
import { expectPostgresBalancesEqual } from "../utils/postgresEntityBalances.js";
import {
	replicaSetRunsHere,
	useReplicaSet,
} from "../utils/replicaSet/useReplicaSet.js";

const replicaSet = useReplicaSet({ size: 1 });

/** Long enough for a second hand-in and its push to have landed had either moved anything. */
const SETTLE_WAIT_MS = 3_000;

const entityLock = ({
	entityId,
	requiredBalance = LOCKED,
}: {
	entityId?: string;
	requiredBalance?: number;
}): PairCheck => ({
	entityId,
	featureId: TestFeature.Messages,
	requiredBalance,
	lock: { enabled: true, name: "lock" },
});

test.skipIf(!replicaSetRunsHere)(
	`${chalk.yellowBright("entity-lock-retry1: an entity lock_id on its terms holds nothing new on the Atom; on other terms it is the API's 409")}`,
	async () => {
		const pair = await initPerEntityLockPair({
			pairId: "entity-lock-retry1",
			atom: replicaSet,
		});
		const [ent1] = pair.entityIds;
		await checkPair({ pair, ...entityLock({ entityId: ent1 }) });
		await expectAutumnLockState({
			customerId: pair.atomCustomerId,
			openLockIds: [`${pair.atomCustomerId}-lock`],
			atomSeqs: [1],
		});

		const sameTerms = await checkOnPairAtom({
			pair,
			check: entityLock({ entityId: ent1 }),
		});
		const otherTerms = entityLock({
			entityId: ent1,
			requiredBalance: LOCKED + 1,
		});
		const [apiOther, atomOther] = await Promise.all([
			checkOnApi({ pair, check: otherTerms }),
			checkOnPairAtom({ pair, check: otherTerms }),
		]);

		expect(sameTerms).toMatchObject({
			status: 200,
			forwarded: null,
			body: { allowed: true },
		});
		expect(apiOther.status).toBe(409);
		expect(atomOther.forwarded).toBeNull();
		expectSameReply({ pair, api: apiOther, atom: atomOther });
		await timeout(SETTLE_WAIT_MS);
		await expectAutumnLockState({
			customerId: pair.atomCustomerId,
			openLockIds: [`${pair.atomCustomerId}-lock`],
			atomSeqs: [1],
		});
		await settleEntityLockPair({ pair, finalize: { action: "release" } });
	},
	180_000,
);

test.skipIf(!replicaSetRunsHere)(
	`${chalk.yellowBright("entity-lock-retry2: an entity lock's finalize retried under one Idempotency-Key settles once, as the API's does")}`,
	async () => {
		const pair = await initPerEntityLockPair({
			pairId: "entity-lock-retry2",
			atom: replicaSet,
		});
		await checkPair({ pair, ...entityLock({ entityId: pair.entityIds[0] }) });
		await expectPostgresBalancesEqual({
			apiCustomerId: pair.apiCustomerId,
			atomCustomerId: pair.atomCustomerId,
			openLocks: [`${pair.apiCustomerId}-lock`],
		});
		const finalize = (customerId: string) => ({
			lockName: "lock",
			action: "confirm" as const,
			overrideValue: 10,
			idempotencyKey: `${customerId}-finalize`,
		});

		const apiFirst = await finalizeOnApi({
			pair,
			finalize: finalize(pair.apiCustomerId),
		});
		await finalizeOnApi({ pair, finalize: finalize(pair.apiCustomerId) });
		const atomReplies = await Promise.all([
			finalizeOnPairAtom({ pair, finalize: finalize(pair.atomCustomerId) }),
			finalizeOnPairAtom({ pair, finalize: finalize(pair.atomCustomerId) }),
		]);

		expect(apiFirst).toEqual({ status: 200, body: { success: true } });
		expect(atomReplies).toEqual([
			{ status: 200, forwarded: null, body: { success: true } },
			{ status: 200, forwarded: null, body: { success: true } },
		]);
		await expectAutumnLockState({
			customerId: pair.atomCustomerId,
			openLockIds: [],
		});
		await expectPostgresBalancesEqual({
			apiCustomerId: pair.apiCustomerId,
			atomCustomerId: pair.atomCustomerId,
		});
		await timeout(SETTLE_WAIT_MS);
		await expectPostgresBalancesEqual({
			apiCustomerId: pair.apiCustomerId,
			atomCustomerId: pair.atomCustomerId,
		});
		await expectAtomViewConverged({ pair, featureId: TestFeature.Messages });
	},
	180_000,
);

test.skipIf(!replicaSetRunsHere)(
	`${chalk.yellowBright("entity-lock-retry3: an entity lock taken on the Atom and pushed back, then finalized through it, settles that entity exactly once")}`,
	async () => {
		const pair = await initPerEntityLockPair({
			pairId: "entity-lock-retry3",
			atom: replicaSet,
		});
		// ent-2, so a finalize decided on the wrong entity (or on none) shows in its balance.
		await checkPair({ pair, ...entityLock({ entityId: pair.entityIds[1] }) });

		await settleEntityLockPair({
			pair,
			finalize: { action: "confirm", overrideValue: 10 },
		});
		await timeout(SETTLE_WAIT_MS);
		await expectAutumnLockState({
			customerId: pair.atomCustomerId,
			openLockIds: [],
			atomSeqs: [2],
		});
		await expectPostgresBalancesEqual({
			apiCustomerId: pair.apiCustomerId,
			atomCustomerId: pair.atomCustomerId,
		});
	},
	180_000,
);

test.skipIf(!replicaSetRunsHere)(
	`${chalk.yellowBright("entity-lock-retry4: an entity lock taken through the API, then finalized through the Atom, settles on the lock's entity")}`,
	async () => {
		const pair = await initPerEntityLockPair({
			pairId: "entity-lock-retry4",
			atom: replicaSet,
		});
		const check = entityLock({ entityId: pair.entityIds[0] });
		const [api, atom] = await Promise.all([
			checkOnApi({ pair, check }),
			checkOnApi({ pair, check, customerId: pair.atomCustomerId }),
		]);
		expectSameReply({ pair, api, atom });
		await expectAutumnLockState({
			customerId: pair.atomCustomerId,
			openLockIds: [`${pair.atomCustomerId}-lock`],
		});

		// The Atom journals the finalize undecided (its first seq): the worker decides it on the lock's own row.
		await settleEntityLockPair({
			pair,
			finalize: { action: "confirm", overrideValue: 10 },
			atomSeqs: [1],
		});
	},
	180_000,
);
