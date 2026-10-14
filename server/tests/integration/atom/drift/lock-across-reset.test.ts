/**
 * A lock taken in one billing period and settled in the next: the reset refilled the balance in between.
 *
 * Contract: a reset grants the new period its full allowance; a lock from the old period gives nothing back into the
 * new one (its units were the old period's usage), so after the release the balance is the new period's grant, never
 * above it:
 *  1. on the API: lock 30 of 100, the row's period ends, the release lands after the reset: 100 left, usage 0;
 *  2. on the Atom: the same, the lock taken and released on the Atom; Autumn and the Atom both show 100.
 */

import { expect, test } from "bun:test";
import { TestFeature } from "@tests/setup/v2Features.js";
import { expireCusEntForReset } from "@tests/utils/cusProductUtils/resetTestUtils.js";
import defaultCtx from "@tests/utils/testInitUtils/createTestContext.js";
import chalk from "chalk";
import { evictBalanceWorkerCustomer } from "@/internal/balances/balanceWorker/evictBalanceWorkerCustomer.js";
import { flushBalanceWorkerCustomer } from "@/internal/balances/balanceWorker/flushBalanceWorkerCustomer.js";
import { expectBalanceCorrect } from "../../utils/expectBalanceCorrect.js";
import { expectAutumnLockState } from "../utils/autumnLockState.js";
import { expectAtomBalance } from "../utils/expectAtomBalance.js";
import { finalizeOnAtom } from "../utils/finalizeOnAtom.js";
import {
	replicaSetRunsHere,
	useReplicaSet,
} from "../utils/replicaSet/useReplicaSet.js";
import { initMessagesCustomer } from "./utils/initMessagesCustomer.js";
import { lockMessagesOnAtom } from "./utils/lockMessagesOnAtom.js";

const replicaSet = useReplicaSet({ size: 1 });

const LOCKED = 30;

/** The messages row's period ends now: the next read refills it. */
const endPeriod = async ({ customerId }: { customerId: string }) => {
	await flushBalanceWorkerCustomer({ ctx: defaultCtx, customerId });
	await expireCusEntForReset({
		ctx: defaultCtx,
		customerId,
		featureId: TestFeature.Messages,
	});
	await evictBalanceWorkerCustomer({ ctx: defaultCtx, customerId });
};

test.skipIf(!replicaSetRunsHere)(
	`${chalk.yellowBright("lock-across-reset1: a lock released after its period reset gives nothing back above the new grant (API)")}`,
	async () => {
		const customerId = "lock-across-reset1";
		const lockId = `${customerId}-lock`;
		const { autumnV2_6 } = await initMessagesCustomer({
			customerId,
			atom: replicaSet,
		});
		await autumnV2_6.check({
			customer_id: customerId,
			feature_id: TestFeature.Messages,
			required_balance: LOCKED,
			lock: { enabled: true, lock_id: lockId },
		});
		await endPeriod({ customerId });
		await expectBalanceCorrect({
			customerId,
			featureId: TestFeature.Messages,
			remaining: 100,
		});

		await autumnV2_6.balances.finalize({
			customer_id: customerId,
			lock_id: lockId,
			action: "release",
		});

		await expectAutumnLockState({ customerId, openLockIds: [] });
		await expectBalanceCorrect({
			customerId,
			featureId: TestFeature.Messages,
			remaining: 100,
			usage: 0,
		});
	},
	120_000,
);

test.skipIf(!replicaSetRunsHere)(
	`${chalk.yellowBright("lock-across-reset2: a lock taken and released on the Atom across a reset gives nothing back above the new grant")}`,
	async () => {
		const customerId = "lock-across-reset2";
		const lockId = `${customerId}-lock`;
		const { atom } = await initMessagesCustomer({
			customerId,
			atom: replicaSet,
		});
		await lockMessagesOnAtom({
			atom,
			customerId,
			value: LOCKED,
			lock: { enabled: true, lock_id: lockId },
		});
		await expectAutumnLockState({ customerId, openLockIds: [lockId] });
		await endPeriod({ customerId });
		await expectBalanceCorrect({
			customerId,
			featureId: TestFeature.Messages,
			remaining: 100,
		});

		const released = await finalizeOnAtom({ atom, customerId, lockId });
		expect(released.status).toBe(200);

		await expectAutumnLockState({ customerId, openLockIds: [] });
		await expectBalanceCorrect({
			customerId,
			featureId: TestFeature.Messages,
			remaining: 100,
			usage: 0,
		});
		await expectAtomBalance({ atom, customerId, remaining: 100 });
	},
	120_000,
);
