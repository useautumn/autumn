/**
 * An API finalize of a lock the Atom took, sent before the Atom's hand-in of that lock has reached Autumn: the SDK takes
 * locks edge-first and finalizes at the API, so a short hold races the hand-in.
 *
 * Contract:
 *  1. a release whose lock is handed in shortly after it arrives settles that lock, after the lock: every unit back, the
 *     lock closed, the Atom's seq landed;
 *  2. a finalize of a lock nobody took is still 400 "Lock not found", once the wait for a hand-in has run out.
 */

import { expect, test } from "bun:test";
import { TestFeature } from "@tests/setup/v2Features.js";
import { timeout } from "@tests/utils/genUtils.js";
import chalk from "chalk";
import { LOCK_HAND_IN_WAIT_MS } from "@/internal/balances/finalizeLock/balanceWorker/waitForHandedInLock.js";
import { expectBalanceCorrect } from "../../utils/expectBalanceCorrect.js";
import { expectAutumnLockState } from "../utils/autumnLockState.js";
import {
	replicaSetRunsHere,
	useReplicaSet,
} from "../utils/replicaSet/useReplicaSet.js";
import {
	INCLUDED_MESSAGES,
	initMessagesCustomer,
} from "./utils/initMessagesCustomer.js";
import { lockMessagesOnAtom } from "./utils/lockMessagesOnAtom.js";

const replicaSet = useReplicaSet({ size: 1 });

const LOCKED = 30;
/** How long after the finalize the lock's hand-in reaches Autumn: well inside the wait. */
const HAND_IN_LAG_MS = 300;

const finalizeOutcome = (finalized: Promise<unknown>) =>
	finalized.then(
		() => ({ ok: true as const }),
		(error: { code?: string; message?: string }) => ({
			ok: false as const,
			code: error.code,
			message: error.message,
		}),
	);

test.skipIf(!replicaSetRunsHere)(
	`${chalk.yellowBright("finalize-before-hand-in1: a release sent before the Atom's lock reached Autumn settles that lock once it lands")}`,
	async () => {
		const customerId = "finalize-before-hand-in1";
		const lockId = `${customerId}-lock`;
		const { atom, autumnV2_6 } = await initMessagesCustomer({
			customerId,
			atom: replicaSet,
		});
		const set = replicaSet();
		set.holdHandIns();
		await lockMessagesOnAtom({
			atom,
			customerId,
			value: LOCKED,
			lock: { enabled: true, lock_id: lockId },
		});

		const finalized = finalizeOutcome(
			autumnV2_6.balances.finalize({
				customer_id: customerId,
				lock_id: lockId,
				action: "release",
			}),
		);
		await timeout(HAND_IN_LAG_MS);
		await set.releaseHandIns();

		expect(await finalized).toEqual({ ok: true });
		await expectAutumnLockState({
			customerId,
			openLockIds: [],
			atomSeqs: [1],
		});
		await expectBalanceCorrect({
			customerId,
			featureId: TestFeature.Messages,
			remaining: INCLUDED_MESSAGES,
		});
	},
	120_000,
);

test.skipIf(!replicaSetRunsHere)(
	`${chalk.yellowBright("finalize-before-hand-in2: a lock nobody took is still 400 Lock not found, after the wait")}`,
	async () => {
		const customerId = "finalize-before-hand-in2";
		const { autumnV2_6 } = await initMessagesCustomer({
			customerId,
			atom: replicaSet,
		});
		const startedAt = Date.now();

		const finalized = await finalizeOutcome(
			autumnV2_6.balances.finalize({
				customer_id: customerId,
				lock_id: `${customerId}-never-taken`,
				action: "release",
			}),
		);

		expect(finalized).toMatchObject({
			ok: false,
			message: expect.stringContaining("Lock not found"),
		});
		expect(Date.now() - startedAt).toBeGreaterThanOrEqual(LOCK_HAND_IN_WAIT_MS);
	},
	120_000,
);
