/**
 * A finalize the Atom answers from its own view, while that view is behind Autumn's balance: the push that would have
 * told it is held back, as a slow link holds it.
 *
 * Contract: a finalize the Atom answered 200 is the lock's one terminal state at Autumn too. The Atom tells the caller
 * the lock is settled, so Autumn must not leave it open, nor settle it another way.
 *  1. a confirm above the lock, answered by the Atom while Autumn's balance has since moved (an API track): Autumn closes
 *     the lock and the Atom's 200 is what Autumn did;
 *  2. a confirm sent to the Atom after the lock's expiry, which Autumn's timer has released: Autumn charges what the Atom
 *     said it confirmed, or the Atom must not have answered 200;
 *  3. a lock the Atom grants on its view while Autumn's balance has since moved (an API track): what the Atom holds and
 *     what its confirm settles is what Autumn holds and charges.
 */

import { expect, test } from "bun:test";
import type { ApiCustomerV5 } from "@autumn/shared";
import { TestFeature } from "@tests/setup/v2Features.js";
import { items } from "@tests/utils/fixtures/items.js";
import { products } from "@tests/utils/fixtures/products.js";
import { pollUntilAsserted } from "@tests/utils/genUtils.js";
import defaultCtx from "@tests/utils/testInitUtils/createTestContext.js";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario.js";
import chalk from "chalk";
import { flushBalanceWorkerCustomer } from "@/internal/balances/balanceWorker/flushBalanceWorkerCustomer.js";
import { getBalanceLock } from "@/internal/balances/finalizeLock/balanceWorker/getBalanceLock.js";
import { expireLock } from "@/internal/balances/finalizeLock/expireLock.js";
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

const replicaSet = useReplicaSet({ size: 1 });

const LOCKED = 30;

const initLockedCustomer = async ({
	customerId,
	expiresAt,
}: {
	customerId: string;
	expiresAt?: number;
}) => {
	const free = products.base({
		id: "free",
		items: [items.monthlyMessages({ includedUsage: 100 })],
	});
	const scenario = await initScenario({
		customerId,
		setup: [s.customer({ testClock: false }), s.products({ list: [free] })],
		actions: [s.billing.attach({ productId: free.id })],
	});
	const atom = replicaSet();
	const lockId = `${customerId}-lock`;
	await expectAtomBalance({ atom, customerId, remaining: 100 });
	const locked = await checkOnAtom({
		atom,
		secretKey: defaultCtx.orgSecretKey,
		customerId,
		featureId: TestFeature.Messages,
		requiredBalance: LOCKED,
		lock: {
			enabled: true,
			lock_id: lockId,
			...(expiresAt && { expires_at: expiresAt }),
		},
	});
	expect(locked).toMatchObject({ forwarded: null, body: { allowed: true } });
	await expectAutumnLockState({
		customerId,
		openLockIds: [lockId],
		atomSeqs: [1],
	});
	await expectAtomBalance({ atom, customerId, remaining: 100 - LOCKED });
	return { ...scenario, atom, lockId };
};

test.skipIf(!replicaSetRunsHere)(
	`${chalk.yellowBright("atom-finalize-drift1: a confirm above the lock the Atom answers 200 while Autumn's balance moved leaves no lock open at Autumn")}`,
	async () => {
		const customerId = "atom-finalize-drift1";
		const { atom, lockId, autumnV2_6 } = await initLockedCustomer({
			customerId,
		});

		replicaSet().holdPushes();
		await autumnV2_6.track({
			customer_id: customerId,
			feature_id: TestFeature.Messages,
			value: 60,
			async: false,
		});
		await expectBalanceCorrect({
			customerId,
			featureId: TestFeature.Messages,
			remaining: 10,
		});

		// The Atom's view still has 70 free: 20 more than the lock is there to draw.
		const confirmed = await finalizeOnAtom({
			atom,
			customerId,
			lockId,
			action: "confirm",
			overrideValue: 50,
		});
		expect(confirmed).toEqual({
			status: 200,
			forwarded: null,
			body: { success: true },
		});
		await replicaSet().releasePushes();

		// The finalize reached Autumn: its seq landed.
		await pollUntilAsserted({
			fetch: () => atomSeqsOf({ customerId }),
			assert: (seqs) => expect(seqs).toEqual([2]),
		});
		expect(await openLockIdsOf({ customerId })).toEqual([]);
	},
	120_000,
);

test.skipIf(!replicaSetRunsHere)(
	`${chalk.yellowBright("atom-finalize-drift2: a confirm the Atom answers 200 after Autumn's timer released the lock is charged, or not answered 200")}`,
	async () => {
		const customerId = "atom-finalize-drift2";
		// Long enough for the lock to land at Autumn before its own timer releases it.
		const expiresAt = Date.now() + 20_000;
		const { atom, lockId } = await initLockedCustomer({
			customerId,
			expiresAt,
		});
		const lockRow = await getBalanceLock({
			ctx: defaultCtx,
			lockId,
			customerId,
		});

		replicaSet().holdPushes();
		// The lock's timer, fired once its expiry has passed, as the scheduler fires it.
		await Bun.sleep(Math.max(0, expiresAt - Date.now()) + 100);
		await flushBalanceWorkerCustomer({ ctx: defaultCtx, customerId });
		await expireLock({
			ctx: { ...defaultCtx, timestamp: Date.now() },
			payload: {
				orgId: defaultCtx.org.id,
				env: defaultCtx.env,
				customerId,
				lockId,
				hashedKey: Bun.hash(lockRow?.id ?? "").toString(),
				lockRowId: lockRow?.id,
			},
		});
		await expectAutumnLockState({ customerId, openLockIds: [] });

		const confirmed = await finalizeOnAtom({
			atom,
			customerId,
			lockId,
			action: "confirm",
		});
		await replicaSet().releasePushes();
		await pollUntilAsserted({
			fetch: () => atomSeqsOf({ customerId }),
			assert: (seqs) =>
				expect(seqs).toEqual(confirmed.status === 200 ? [2] : [1]),
		});

		const charged = confirmed.status === 200 ? LOCKED : 0;
		await expectBalanceCorrect({
			customerId,
			featureId: TestFeature.Messages,
			remaining: 100 - charged,
		});
		await expectAtomBalance({ atom, customerId, remaining: 100 - charged });
	},
	120_000,
);

test.skipIf(!replicaSetRunsHere)(
	`${chalk.yellowBright("atom-finalize-drift3: a lock the Atom grants on a view behind Autumn is held and charged at Autumn as the Atom told its caller")}`,
	async () => {
		const customerId = "atom-finalize-drift3";
		const lockId = `${customerId}-lock`;
		const free = products.base({
			id: "free",
			items: [items.monthlyMessages({ includedUsage: 100 })],
		});
		const { autumnV2_6 } = await initScenario({
			customerId,
			setup: [s.customer({ testClock: false }), s.products({ list: [free] })],
			actions: [s.billing.attach({ productId: free.id })],
		});
		const atom = replicaSet();
		await expectAtomBalance({ atom, customerId, remaining: 100 });

		replicaSet().holdPushes();
		await autumnV2_6.track({
			customer_id: customerId,
			feature_id: TestFeature.Messages,
			value: 90,
			async: false,
		});
		// The Atom's view still shows 100 free.
		const locked = await checkOnAtom({
			atom,
			secretKey: defaultCtx.orgSecretKey,
			customerId,
			featureId: TestFeature.Messages,
			requiredBalance: LOCKED,
			lock: { enabled: true, lock_id: lockId },
		});
		expect(locked).toMatchObject({ forwarded: null, body: { allowed: true } });
		await pollUntilAsserted({
			fetch: () => atomSeqsOf({ customerId }),
			assert: (seqs) => expect(seqs).toEqual([1]),
		});
		const confirmed = await finalizeOnAtom({
			atom,
			customerId,
			lockId,
			action: "confirm",
		});
		expect(confirmed).toMatchObject({ status: 200, forwarded: null });
		await replicaSet().releasePushes();

		await pollUntilAsserted({
			fetch: () => atomSeqsOf({ customerId }),
			assert: (seqs) => expect(seqs).toEqual([2]),
		});
		await expectAutumnLockState({ customerId, openLockIds: [] });
		const customer = await autumnV2_6.customers.get<ApiCustomerV5>(customerId);
		expect(customer.balances[TestFeature.Messages]?.usage).toBe(90 + LOCKED);
	},
	120_000,
);
