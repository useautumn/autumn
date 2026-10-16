/**
 * An entity lock and its finalize sent through the SDK under `useEdge`, against the same lock and finalize on the API.
 *
 * Contract: the SDK goes edge-first to the Atom for both; the Atom takes the entity lock itself (no forward) and
 * journals the finalize behind it, so the API is never asked; once the hand-ins land, Autumn settles the lock on its
 * entity exactly once, Postgres ends where the API's customer ends, and the Atom's view converges.
 *
 * Red on dev: the Atom forwards the entity lock (x-atom-forwarded: lock), and the finalize of the lock the API took is
 * refused at the worker (entity_not_found), leaving it open.
 */

import { expect, test } from "bun:test";
import { TestFeature } from "@tests/setup/v2Features.js";
import { timeout } from "@tests/utils/genUtils.js";
import chalk from "chalk";
import { expectAutumnLockState } from "../utils/autumnLockState.js";
import {
	initPerEntityLockPair,
	LOCKED,
} from "../utils/entityPair/entityLockPair.js";
import {
	checkOnApi,
	expectAtomViewConverged,
	finalizeOnApi,
	pairLockId,
} from "../utils/entityPair/pairReplies.js";
import { expectPostgresBalancesEqual } from "../utils/postgresEntityBalances.js";
import {
	replicaSetRunsHere,
	useReplicaSet,
} from "../utils/replicaSet/useReplicaSet.js";
import { sdkThroughEdgeTaps } from "./utils/sdkEdgeTaps.js";

const replicaSet = useReplicaSet({ size: 1 });

const CONFIRMED = 10;
/** Long enough for a second settle to have landed had the finalize been decided twice. */
const SETTLE_WAIT_MS = 3_000;

test.skipIf(!replicaSetRunsHere)(
	`${chalk.yellowBright("entity-sdk-finalize-edge1: an entity lock and its finalize through the SDK's edge settle once, as on the API; the API is never asked")}`,
	async () => {
		const pair = await initPerEntityLockPair({
			pairId: "entity-sdk-edge1",
			atom: replicaSet,
		});
		const [ent1] = pair.entityIds;
		const set = replicaSet();
		const taps = sdkThroughEdgeTaps({
			atom: pair.atom,
			customerId: pair.atomCustomerId,
		});
		try {
			await checkOnApi({
				pair,
				check: {
					entityId: ent1,
					featureId: TestFeature.Messages,
					requiredBalance: LOCKED,
					lock: { enabled: true, name: "lock" },
				},
			});
			await finalizeOnApi({
				pair,
				finalize: {
					lockName: "lock",
					action: "confirm",
					overrideValue: CONFIRMED,
				},
			});

			set.holdHandIns();
			const lockId = pairLockId({
				customerId: pair.atomCustomerId,
				name: "lock",
			});
			const locked = await taps.sdk.check({
				customerId: pair.atomCustomerId,
				entityId: ent1,
				featureId: TestFeature.Messages,
				requiredBalance: LOCKED,
				lock: { enabled: true, lockId },
			});
			// Not a literal: dev's SDK lacks customerId (excess-property error), main's regenerated SDK requires it.
			const params = {
				customerId: pair.atomCustomerId,
				lockId,
				action: "confirm" as const,
				overrideValue: CONFIRMED,
			};
			const finalized = await taps.sdk.balances.finalize(params).then(
				(reply) => ({ status: 200, reply }),
				(error: { statusCode?: number }) => ({
					status: error.statusCode ?? null,
				}),
			);

			expect(locked.allowed).toBe(true);
			expect(finalized).toEqual({ status: 200, reply: { success: true } });
			expect(taps.api.seen).toEqual([]);
			expect(
				taps.edge.seen.map(({ path, forwarded }) => ({ path, forwarded })),
			).toEqual([
				{ path: "/v1/balances.check", forwarded: null },
				{ path: "/v1/balances.finalize", forwarded: null },
			]);
			await expectAutumnLockState({
				customerId: pair.atomCustomerId,
				openLockIds: [],
				atomSeqs: [],
			});

			await set.releaseHandIns();
			await expectAutumnLockState({
				customerId: pair.atomCustomerId,
				openLockIds: [],
				atomSeqs: [2],
			});
			await expectPostgresBalancesEqual({
				apiCustomerId: pair.apiCustomerId,
				atomCustomerId: pair.atomCustomerId,
			});
			await expectAtomViewConverged({ pair, featureId: TestFeature.Messages });
			await timeout(SETTLE_WAIT_MS);
			await expectPostgresBalancesEqual({
				apiCustomerId: pair.apiCustomerId,
				atomCustomerId: pair.atomCustomerId,
			});
		} finally {
			taps.stop();
		}
	},
	180_000,
);
