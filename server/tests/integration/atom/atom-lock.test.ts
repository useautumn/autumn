/**
 * A lock taken on an org's Atom, on the dev stack.
 *
 * Contract:
 *  1. a customer's own lock is taken on the Atom, not the API: the Atom's view holds the units at once, and its
 *     journal hands the locked track to Autumn with its writer and seq, where it lands as one balance_locks row;
 *  2. its finalize is settled on the Atom too and handed in after the lock: Autumn closes the lock, the units come back,
 *     and the finalize's own seq lands on the customer, so the Atom's journal clears it;
 *  3. a lock the caller set an expiry on is released by Autumn's timer once handed in: the push that follows drops the
 *     Atom's own row for it, so a later finalize goes to the API, and the Atom's check shows the units back.
 */

import { afterAll, expect, test } from "bun:test";
import { balanceLocks, customers, LATEST_VERSION } from "@autumn/shared";
import { TestFeature } from "@tests/setup/v2Features.js";
import { isBalanceWorkerRoute } from "@tests/utils/balanceWorkerRouteTestUtils.js";
import { items } from "@tests/utils/fixtures/items.js";
import { products } from "@tests/utils/fixtures/products.js";
import { pollUntilAsserted } from "@tests/utils/genUtils.js";
import defaultCtx from "@tests/utils/testInitUtils/createTestContext.js";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario.js";
import chalk from "chalk";
import { and, eq } from "drizzle-orm";
import { flushBalanceWorkerCustomer } from "@/internal/balances/balanceWorker/flushBalanceWorkerCustomer.js";
import { expireLock } from "@/internal/balances/finalizeLock/expireLock.js";
import { expectBalanceCorrect } from "../utils/expectBalanceCorrect.js";
import { atomTestClient } from "./utils/atomTestClient.js";
import {
	atomIsHosted,
	deleteAtomDeployment,
	ensureAtomDeployment,
	type TestAtom,
} from "./utils/ensureAtomDeployment.js";
import { expectAtomBalance } from "./utils/expectAtomBalance.js";
import { checkOnAtom } from "./utils/expectAtomCheckCorrect.js";

const autumn = atomTestClient();

afterAll(async () => {
	await deleteAtomDeployment({ autumn });
});

/** A finalize sent to the Atom as an SDK on the latest API version sends it. */
const finalizeOnAtom = async ({
	atom,
	customerId,
	lockId,
}: {
	atom: TestAtom;
	customerId: string;
	lockId: string;
}) => {
	const response = await fetch(`${atom.endpointUrl}/v1/balances.finalize`, {
		method: "POST",
		headers: {
			"Content-Type": "application/json",
			Authorization: `Bearer ${defaultCtx.orgSecretKey}`,
			"x-api-version": LATEST_VERSION,
			"x-atom-token": atom.token,
		},
		body: JSON.stringify({
			customer_id: customerId,
			lock_id: lockId,
			action: "release",
		}),
	});
	return {
		status: response.status,
		forwarded: response.headers.get("x-atom-forwarded"),
		body: await response.json(),
	};
};

/** Every seq Autumn holds on the customer's row, across the Atom's journals. */
const atomSeqsOf = async ({ customerId }: { customerId: string }) => {
	const [row] = await defaultCtx.db
		.select({ atomSeqs: customers.atom_seqs })
		.from(customers)
		.where(
			and(
				eq(customers.org_id, defaultCtx.org.id),
				eq(customers.env, defaultCtx.env),
				eq(customers.id, customerId),
			),
		);
	return Object.values(row?.atomSeqs ?? {}).flatMap((writerSeqs) =>
		Object.values(writerSeqs),
	);
};

const ofThisCustomer = ({ customerId }: { customerId: string }) =>
	and(
		eq(balanceLocks.org_id, defaultCtx.org.id),
		eq(balanceLocks.env, defaultCtx.env),
		eq(balanceLocks.customer_id, customerId),
	);

// A handed-in track only lands through the balance worker's log, and only the dev stack's own Atom is a test's to use.
test.skipIf(!isBalanceWorkerRoute() || atomIsHosted())(
	`${chalk.yellowBright("atom-lock1: a lock taken on the Atom hands in with its writer and seq, and Autumn lands one balance_locks row")}`,
	async () => {
		const free = products.base({
			id: "free",
			items: [items.monthlyMessages({ includedUsage: 100 })],
		});
		const { customerId } = await initScenario({
			customerId: "atom-lock1",
			setup: [s.customer({ testClock: false }), s.products({ list: [free] })],
			actions: [s.billing.attach({ productId: free.id })],
		});
		const atom = await ensureAtomDeployment({ autumn });
		await expectAtomBalance({ atom, customerId, remaining: 100 });

		const locked = await checkOnAtom({
			atom,
			secretKey: defaultCtx.orgSecretKey,
			customerId,
			featureId: TestFeature.Messages,
			requiredBalance: 30,
			lock: { enabled: true, lock_id: "atom-lock1-lock" },
		});

		expect(locked.forwarded).toBeNull();
		expect(locked.body).toMatchObject({ allowed: true });
		await expectAtomBalance({ atom, customerId, remaining: 70, timeoutMs: 0 });
		await pollUntilAsserted({
			fetch: () =>
				defaultCtx.db
					.select({ lockId: balanceLocks.lock_id })
					.from(balanceLocks)
					.where(ofThisCustomer({ customerId })),
			assert: (rows) => expect(rows).toEqual([{ lockId: "atom-lock1-lock" }]),
		});
		await pollUntilAsserted({
			fetch: () => atomSeqsOf({ customerId }),
			assert: (seqs) => expect(seqs).toEqual([1]),
		});
		await expectBalanceCorrect({
			customerId,
			featureId: TestFeature.Messages,
			remaining: 70,
		});
	},
	120_000,
);

test.skipIf(!isBalanceWorkerRoute() || atomIsHosted())(
	`${chalk.yellowBright("atom-lock2: a finalize settled on the Atom hands in after its lock, and Autumn closes the lock")}`,
	async () => {
		const free = products.base({
			id: "free",
			items: [items.monthlyMessages({ includedUsage: 100 })],
		});
		const { customerId } = await initScenario({
			customerId: "atom-lock2",
			setup: [s.customer({ testClock: false }), s.products({ list: [free] })],
			actions: [s.billing.attach({ productId: free.id })],
		});
		const atom = await ensureAtomDeployment({ autumn });
		await expectAtomBalance({ atom, customerId, remaining: 100 });
		await checkOnAtom({
			atom,
			secretKey: defaultCtx.orgSecretKey,
			customerId,
			featureId: TestFeature.Messages,
			requiredBalance: 30,
			lock: { enabled: true, lock_id: "atom-lock2-lock" },
		});

		const released = await finalizeOnAtom({
			atom,
			customerId,
			lockId: "atom-lock2-lock",
		});

		expect(released).toEqual({
			status: 200,
			forwarded: null,
			body: { success: true },
		});
		await expectAtomBalance({ atom, customerId, remaining: 100, timeoutMs: 0 });
		await expectBalanceCorrect({
			customerId,
			featureId: TestFeature.Messages,
			remaining: 100,
		});
		await pollUntilAsserted({
			fetch: () =>
				defaultCtx.db
					.select({ lockId: balanceLocks.lock_id })
					.from(balanceLocks)
					.where(ofThisCustomer({ customerId })),
			assert: (rows) => expect(rows).toEqual([]),
		});
		await pollUntilAsserted({
			fetch: () => atomSeqsOf({ customerId }),
			assert: (seqs) => expect(seqs).toEqual([2]),
		});
		await expectAtomBalance({ atom, customerId, remaining: 100 });
	},
	120_000,
);

test.skipIf(!isBalanceWorkerRoute() || atomIsHosted())(
	`${chalk.yellowBright("atom-lock3: a lock taken on the Atom with an expiry is released by Autumn's timer, and the push drops the Atom's row for it")}`,
	async () => {
		const free = products.base({
			id: "free",
			items: [items.monthlyMessages({ includedUsage: 100 })],
		});
		const { customerId } = await initScenario({
			customerId: "atom-lock3",
			setup: [s.customer({ testClock: false }), s.products({ list: [free] })],
			actions: [s.billing.attach({ productId: free.id })],
		});
		const atom = await ensureAtomDeployment({ autumn });
		await expectAtomBalance({ atom, customerId, remaining: 100 });
		const lockId = "atom-lock3-lock";
		await checkOnAtom({
			atom,
			secretKey: defaultCtx.orgSecretKey,
			customerId,
			featureId: TestFeature.Messages,
			requiredBalance: 30,
			lock: { enabled: true, lock_id: lockId, expires_at: Date.now() + 60_000 },
		});
		const [row] = await pollUntilAsserted({
			fetch: () =>
				defaultCtx.db
					.select({ id: balanceLocks.id })
					.from(balanceLocks)
					.where(ofThisCustomer({ customerId })),
			assert: (rows) => expect(rows).toHaveLength(1),
		});
		const lockRowId = row?.id ?? "";

		// The hand-in's timer, fired now rather than in a minute, as atom-tracks8 fires it.
		await flushBalanceWorkerCustomer({ ctx: defaultCtx, customerId });
		await expireLock({
			ctx: { ...defaultCtx, timestamp: Date.now() },
			payload: {
				orgId: defaultCtx.org.id,
				env: defaultCtx.env,
				customerId,
				lockId,
				hashedKey: Bun.hash(lockRowId).toString(),
				lockRowId,
			},
		});

		await expectBalanceCorrect({
			customerId,
			featureId: TestFeature.Messages,
			remaining: 100,
		});
		await expectAtomBalance({ atom, customerId, remaining: 100 });
		const afterExpiry = await finalizeOnAtom({ atom, customerId, lockId });
		expect(afterExpiry.forwarded).toBe("lock_not_held");
	},
	120_000,
);
