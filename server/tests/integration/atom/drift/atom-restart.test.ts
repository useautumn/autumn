/**
 * An Atom replica killed (SIGKILL) while Autumn has yet to take its journal: the hand-ins are held at the gate, so the
 * replica dies owing them, and the one it was sending reaches Autumn only after it restarted and resent everything.
 *
 * Contract: what the replica granted is deducted once, whatever arrives twice:
 *  1. after the restart, the Atom's view still holds the track and the lock it granted (replayed from its journal),
 *     and a retry of the lock on its terms is the same lock (no new hold, no new journal entry);
 *  2. once the held and the resent hand-ins land, Autumn holds exactly one deduction and one lock, and the seqs the
 *     replica journaled; the Atom's view and Autumn agree;
 *  3. a lock whose entry Autumn already took (and the push trimmed) is no longer in a restarted replica's memory: its
 *     finalize on the Atom is forwarded (`lock_not_held`) and the API settles it once.
 */

import { expect, test } from "bun:test";
import { TestFeature } from "@tests/setup/v2Features.js";
import { pollUntilAsserted } from "@tests/utils/genUtils.js";
import chalk from "chalk";
import { expectBalanceCorrect } from "../../utils/expectBalanceCorrect.js";
import { expectAutumnLockState } from "../utils/autumnLockState.js";
import { expectAtomBalance } from "../utils/expectAtomBalance.js";
import { finalizeOnAtom } from "../utils/finalizeOnAtom.js";
import {
	replicaSetRunsHere,
	useReplicaSet,
} from "../utils/replicaSet/useReplicaSet.js";
import { trackOnAtom } from "../utils/trackOnAtom.js";
import { initMessagesCustomer } from "./utils/initMessagesCustomer.js";
import { lockMessagesOnAtom } from "./utils/lockMessagesOnAtom.js";

const replicaSet = useReplicaSet({ size: 1 });

test.skipIf(!replicaSetRunsHere)(
	`${chalk.yellowBright("atom-restart1: a replica killed while owing its journal deducts once after it restarts and resends")}`,
	async () => {
		const customerId = "atom-restart1";
		const lockId = `${customerId}-lock`;
		const lock = { enabled: true, lock_id: lockId } as const;
		const { atom } = await initMessagesCustomer({
			customerId,
			atom: replicaSet,
		});

		replicaSet().holdHandIns();
		const tracked = await trackOnAtom({
			atom,
			customerId,
			featureId: TestFeature.Messages,
			value: 10,
		});
		expect(tracked).toMatchObject({ status: 202, forwarded: null });
		await lockMessagesOnAtom({ atom, customerId, value: 20, lock });
		await pollUntilAsserted({
			fetch: async () => replicaSet().heldHandIns(),
			assert: (held) => expect(held).toBeGreaterThan(0),
		});

		await replicaSet().kill(0);
		await replicaSet().start(0);

		await expectAtomBalance({ atom, customerId, remaining: 70, timeoutMs: 0 });
		await lockMessagesOnAtom({ atom, customerId, value: 20, lock });
		await expectAtomBalance({ atom, customerId, remaining: 70, timeoutMs: 0 });

		await replicaSet().releaseHandIns();
		await expectAutumnLockState({
			customerId,
			openLockIds: [lockId],
			atomSeqs: [2],
		});
		await expectBalanceCorrect({
			customerId,
			featureId: TestFeature.Messages,
			remaining: 70,
		});
		await expectAtomBalance({ atom, customerId, remaining: 70 });
	},
	180_000,
);

test.skipIf(!replicaSetRunsHere)(
	`${chalk.yellowBright("atom-restart2: a restarted replica forwards the finalize of a lock Autumn already holds, and the API settles it once")}`,
	async () => {
		const customerId = "atom-restart2";
		const lockId = `${customerId}-lock`;
		const { atom } = await initMessagesCustomer({
			customerId,
			atom: replicaSet,
		});
		await lockMessagesOnAtom({
			atom,
			customerId,
			value: 30,
			lock: { enabled: true, lock_id: lockId },
		});
		await expectAutumnLockState({
			customerId,
			openLockIds: [lockId],
			atomSeqs: [1],
		});
		// The push that shows seq 1 applied has trimmed it from the journal.
		await expectAtomBalance({ atom, customerId, remaining: 70 });

		await replicaSet().restart(0);
		const released = await finalizeOnAtom({ atom, customerId, lockId });
		const resent = await finalizeOnAtom({ atom, customerId, lockId });

		expect(released).toMatchObject({
			status: 200,
			forwarded: "lock_not_held",
		});
		expect(resent.status).toBeGreaterThanOrEqual(400);
		await expectAutumnLockState({
			customerId,
			openLockIds: [],
			atomSeqs: [1],
		});
		await expectBalanceCorrect({
			customerId,
			featureId: TestFeature.Messages,
			remaining: 100,
		});
		await expectAtomBalance({ atom, customerId, remaining: 100 });
	},
	180_000,
);
