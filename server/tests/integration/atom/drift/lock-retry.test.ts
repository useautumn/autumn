/**
 * A lock_id sent again on the Atom (D2): the same lock on its terms, a conflict on any other, and a new lock once the
 * first is settled.
 *
 * Contract:
 *  1. a retry on the lock's own terms is allowed once more and holds nothing new: no second hold on the Atom's view, no
 *     journal entry (Autumn holds seq 1 only), one balance_locks row; a retry on other terms is 409; the same-terms
 *     retry sent to the API stays the API's 409 (D2 is the Atom's alone, by design);
 *  2. a lock_id taken again after its lock was released on the Atom is a new lock: it holds its units on the Atom and,
 *     once handed in, at Autumn, even while the push that shows the first lock settled is still on its way.
 */

import { expect, test } from "bun:test";
import { ErrCode } from "@autumn/shared";
import { TestFeature } from "@tests/setup/v2Features.js";
import { pollUntilAsserted } from "@tests/utils/genUtils.js";
import defaultCtx from "@tests/utils/testInitUtils/createTestContext.js";
import chalk from "chalk";
import { expectBalanceCorrect } from "../../utils/expectBalanceCorrect.js";
import {
	atomSeqsOf,
	expectAutumnLockState,
	openLockIdsOf,
} from "../utils/autumnLockState.js";
import { expectAtomBalance } from "../utils/expectAtomBalance.js";
import { checkOnAtom } from "../utils/expectAtomCheckCorrect.js";
import { finalizeOnAtom } from "../utils/finalizeOnAtom.js";
import {
	replicaSetRunsHere,
	useReplicaSet,
} from "../utils/replicaSet/useReplicaSet.js";
import { initMessagesCustomer } from "./utils/initMessagesCustomer.js";
import { lockMessagesOnAtom } from "./utils/lockMessagesOnAtom.js";

const replicaSet = useReplicaSet({ size: 1 });

const LOCKED = 30;

test.skipIf(!replicaSetRunsHere)(
	`${chalk.yellowBright("lock-retry1: a lock_id retried on its terms holds nothing new; on other terms it is 409; on the API it stays 409")}`,
	async () => {
		const customerId = "lock-retry1";
		const lockId = `${customerId}-lock`;
		const { atom, autumnV2_6 } = await initMessagesCustomer({
			customerId,
			atom: replicaSet,
		});
		const lock = { enabled: true, lock_id: lockId } as const;
		await lockMessagesOnAtom({ atom, customerId, value: LOCKED, lock });
		// The API sees the lock only once Autumn holds it.
		await expectAutumnLockState({ customerId, openLockIds: [lockId] });

		await lockMessagesOnAtom({ atom, customerId, value: LOCKED, lock });
		const otherTerms = await checkOnAtom({
			atom,
			secretKey: defaultCtx.orgSecretKey,
			customerId,
			featureId: TestFeature.Messages,
			requiredBalance: LOCKED + 1,
			lock,
		});
		const onApi = await autumnV2_6
			.check({
				customer_id: customerId,
				feature_id: TestFeature.Messages,
				required_balance: LOCKED,
				lock,
			})
			.then(
				() => null,
				(error: { code?: string }) => error.code,
			);

		expect(otherTerms.status).toBe(409);
		expect(onApi).toBe(ErrCode.LockAlreadyExists);
		await expectAutumnLockState({
			customerId,
			openLockIds: [lockId],
			atomSeqs: [1],
		});
		await expectBalanceCorrect({
			customerId,
			featureId: TestFeature.Messages,
			remaining: 100 - LOCKED,
		});
		await expectAtomBalance({ atom, customerId, remaining: 100 - LOCKED });
	},
	120_000,
);

test.skipIf(!replicaSetRunsHere)(
	`${chalk.yellowBright("lock-retry2: a lock_id taken again after the Atom released it is a new lock, before the push shows the first one settled")}`,
	async () => {
		const customerId = "lock-retry2";
		const lockId = `${customerId}-lock`;
		const { atom } = await initMessagesCustomer({
			customerId,
			atom: replicaSet,
		});
		const lock = { enabled: true, lock_id: lockId } as const;
		await lockMessagesOnAtom({ atom, customerId, value: LOCKED, lock });
		await expectAutumnLockState({ customerId, openLockIds: [lockId] });

		replicaSet().holdPushes();
		const released = await finalizeOnAtom({ atom, customerId, lockId });
		expect(released).toMatchObject({ status: 200, forwarded: null });
		await lockMessagesOnAtom({ atom, customerId, value: LOCKED, lock });
		const viewBeforePush = await checkOnAtom({
			atom,
			secretKey: defaultCtx.orgSecretKey,
			customerId,
			featureId: TestFeature.Messages,
			requiredBalance: 100 - LOCKED + 1,
		});
		await replicaSet().releasePushes();

		// The lock (seq 1), its release (seq 2), then the new lock (seq 3) on the same lock_id.
		await pollUntilAsserted({
			fetch: async () => ({
				atomViewHeldTheNewLock: viewBeforePush.body,
				seqs: await atomSeqsOf({ customerId }),
				openLockIds: await openLockIdsOf({ customerId }),
			}),
			assert: (state) =>
				expect(state).toMatchObject({
					atomViewHeldTheNewLock: { allowed: false },
					seqs: [3],
					openLockIds: [lockId],
				}),
			timeoutMs: 15_000,
		});
		await expectBalanceCorrect({
			customerId,
			featureId: TestFeature.Messages,
			remaining: 100 - LOCKED,
		});
	},
	120_000,
);
