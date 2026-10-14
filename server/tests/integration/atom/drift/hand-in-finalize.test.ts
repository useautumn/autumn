/**
 * An Atom's finalize handed in on its own, after Autumn already holds the lock it names: the usual order, since a caller
 * settles a lock some time after taking it.
 *
 * Contract: the finalize settles Autumn's own row for the lock, read with the Kafka batch it arrives in, exactly as when
 * the lock and its finalize arrive in one request (atom-tracks5):
 *  1. a release handed in once the lock's row is in Postgres gives every unit back and closes the lock;
 *  2. a confirm below the lock, handed in the same way, keeps what it confirms and closes the lock.
 */

import { expect, test } from "bun:test";
import type { TrackCommand } from "@autumn/balance-engine";
import { ATOM_TRACKS_APPEND_PATH, type AtomFinalize } from "@autumn/byoc";
import { TestFeature } from "@tests/setup/v2Features.js";
import { isBalanceWorkerRoute } from "@tests/utils/balanceWorkerRouteTestUtils.js";
import { items } from "@tests/utils/fixtures/items.js";
import { products } from "@tests/utils/fixtures/products.js";
import { pollUntilAsserted } from "@tests/utils/genUtils.js";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario.js";
import chalk from "chalk";
import { atomTokenToHash } from "@/internal/byoc/utils/atomTokenUtils.js";
import { expectBalanceCorrect } from "../../utils/expectBalanceCorrect.js";
import { atomFinalizeOf, atomTrack, postAsAtom } from "../utils/atomHandIn.js";
import { atomTestClient } from "../utils/atomTestClient.js";
import { atomSeqsOf, openLockIdsOf } from "../utils/autumnLockState.js";
import { ensureAtomDeployment } from "../utils/ensureAtomDeployment.js";

const autumn = atomTestClient();

/** A customer with 10 messages whose Atom handed in a lock of 8, now held in Autumn's Postgres. */
const initHeldLock = async ({ customerId }: { customerId: string }) => {
	const free = products.base({
		id: "free",
		items: [items.monthlyMessages({ includedUsage: 10 })],
	});
	await initScenario({
		customerId,
		setup: [s.customer({ testClock: false }), s.products({ list: [free] })],
		actions: [s.billing.attach({ productId: free.id })],
	});
	const atom = await ensureAtomDeployment({ autumn });
	const tokenHash = atomTokenToHash({ token: atom.token });
	const writerId = `w_${crypto.randomUUID()}`;
	const append = async (
		handIn: { command: TrackCommand } | { finalize: AtomFinalize },
		seq: number,
	) => {
		const reply = await postAsAtom({
			autumn,
			path: ATOM_TRACKS_APPEND_PATH,
			tokenHash,
			body: { tracks: [{ writerId, seq, ...handIn }] },
		});
		expect(reply.status).toBe(204);
	};
	await append(
		{
			command: atomTrack({
				customerId,
				value: 8,
				lock: {
					id: `lck_${crypto.randomUUID()}`,
					lockId: customerId,
					expiresAt: Date.now() + 3_600_000,
					expiryAction: "confirm",
				},
			}),
		},
		1,
	);
	await pollUntilAsserted({
		fetch: () => openLockIdsOf({ customerId }),
		assert: (lockIds) => expect(lockIds).toEqual([customerId]),
	});
	return { append };
};

/** Once the finalize's seq landed, the lock is closed and the balance is what the finalize left. */
const expectSettled = async ({
	customerId,
	remaining,
}: {
	customerId: string;
	remaining: number;
}) => {
	await pollUntilAsserted({
		fetch: () => atomSeqsOf({ customerId }),
		assert: (seqs) => expect(seqs).toEqual([2]),
	});
	expect(await openLockIdsOf({ customerId })).toEqual([]);
	await expectBalanceCorrect({
		customerId,
		featureId: TestFeature.Messages,
		remaining,
	});
};

test.skipIf(!isBalanceWorkerRoute())(
	`${chalk.yellowBright("hand-in-finalize1: a release handed in after Autumn holds its lock gives every unit back")}`,
	async () => {
		const customerId = "hand-in-finalize1";
		const { append } = await initHeldLock({ customerId });

		await append(
			{ finalize: atomFinalizeOf({ customerId, lockId: customerId }) },
			2,
		);

		await expectSettled({ customerId, remaining: 10 });
	},
	120_000,
);

test.skipIf(!isBalanceWorkerRoute())(
	`${chalk.yellowBright("hand-in-finalize2: a confirm below the lock handed in after Autumn holds it keeps what it confirms")}`,
	async () => {
		const customerId = "hand-in-finalize2";
		const { append } = await initHeldLock({ customerId });

		await append(
			{
				finalize: atomFinalizeOf({
					customerId,
					lockId: customerId,
					finalValue: 5,
				}),
			},
			2,
		);

		await expectSettled({ customerId, remaining: 5 });
	},
	120_000,
);
