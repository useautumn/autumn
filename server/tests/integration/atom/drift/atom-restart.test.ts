/**
 * An Atom replica killed (SIGKILL) while Autumn has yet to take its journal: the hand-ins are held at the gate, so the
 * replica dies owing them, and the one it was sending reaches Autumn only after it restarted and resent everything.
 *
 * Contract: what the replica granted is deducted once, whatever arrives twice:
 *  1. after the restart, the Atom's view still holds the track and the lock it granted (replayed from its journal),
 *     and a retry of the lock on its terms is the same lock (no new hold, no new journal entry);
 *  2. once the held and the resent hand-ins land, Autumn holds exactly one deduction and one lock, and the seqs the
 *     replica journaled; the Atom's view and Autumn agree.
 */

import { expect, test } from "bun:test";
import { TestFeature } from "@tests/setup/v2Features.js";
import { pollUntilAsserted } from "@tests/utils/genUtils.js";
import chalk from "chalk";
import { expectBalanceCorrect } from "../../utils/expectBalanceCorrect.js";
import { expectAutumnLockState } from "../utils/autumnLockState.js";
import { expectAtomBalance } from "../utils/expectAtomBalance.js";
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
