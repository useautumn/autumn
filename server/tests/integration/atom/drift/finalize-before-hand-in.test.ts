/**
 * A finalize of a lock the Atom took, sent where the lock is not yet: the Atom's hand-in is held back, as a slow link or
 * a busy Autumn holds it, so Autumn has no row for the lock when the finalize reaches the API.
 *
 * Contract: the caller locked on an Atom and then settled the lock; the settle is the lock's one terminal state, whatever
 * path it took. Once the hand-in lands, Autumn holds no lock and the balance is what the settle left.
 *  1. a release sent to the API at 2.6 (it names the customer) before the hand-in;
 *  2. a release sent to the Atom before 2.6, which the Atom forwards (`lock_version`) to the API, before the hand-in.
 */

import { expect, test } from "bun:test";
import { type ApiCustomerV5, ApiVersion } from "@autumn/shared";
import { TestFeature } from "@tests/setup/v2Features.js";
import { items } from "@tests/utils/fixtures/items.js";
import { products } from "@tests/utils/fixtures/products.js";
import { pollUntilAsserted } from "@tests/utils/genUtils.js";
import defaultCtx from "@tests/utils/testInitUtils/createTestContext.js";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario.js";
import chalk from "chalk";
import type { AutumnInt } from "@/external/autumn/autumnCli.js";
import { atomSeqsOf, openLockIdsOf } from "../utils/autumnLockState.js";
import { expectAtomBalance } from "../utils/expectAtomBalance.js";
import { checkOnAtom } from "../utils/expectAtomCheckCorrect.js";
import { finalizeOnAtom } from "../utils/finalizeOnAtom.js";
import {
	replicaSetRunsHere,
	useReplicaSet,
} from "../utils/replicaSet/useReplicaSet.js";

const replicaSet = useReplicaSet({ size: 1 });

const LOCKED = 30;

/** A lock of 30 the Atom granted and journaled, its hand-in held at the gate. */
const lockWithHandInHeld = async ({ customerId }: { customerId: string }) => {
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

	atom.holdHandIns();
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
		fetch: async () => atom.heldHandIns(),
		assert: (held) => expect(held).toBeGreaterThan(0),
	});
	return { ...scenario, atom, lockId };
};

/** The held hand-in lands; what Autumn then holds for the customer, once it has applied the hand-in. */
const stateOnceHandedIn = async ({
	autumn,
	customerId,
}: {
	autumn: AutumnInt;
	customerId: string;
}) => {
	await replicaSet().releaseHandIns();
	await pollUntilAsserted({
		fetch: () => atomSeqsOf({ customerId }),
		assert: (seqs) => expect(seqs).toEqual([1]),
	});
	const customer = await autumn.customers.get<ApiCustomerV5>(customerId);
	return {
		remaining: customer.balances[TestFeature.Messages]?.remaining,
		openLockIds: await openLockIdsOf({ customerId }),
	};
};

/** The settle answered success, and once the hand-in landed no lock is held and every unit is back. */
const SETTLED_ONCE = {
	settle: 200,
	remaining: 100,
	openLockIds: [],
};

const releaseOnApi = (params: {
	autumn: AutumnInt;
	customerId: string;
	lockId: string;
}) =>
	params.autumn.balances
		.finalize({
			customer_id: params.customerId,
			lock_id: params.lockId,
			action: "release",
		})
		.then(
			() => 200,
			(error: { code?: string }) => error.code ?? "error",
		);

test.skipIf(!replicaSetRunsHere)(
	`${chalk.yellowBright("finalize-before-hand-in1: a release sent to the API before the Atom's hand-in leaves no lock held once it lands")}`,
	async () => {
		const customerId = "finalize-before-hand-in1";
		const { lockId, autumnV2_6 } = await lockWithHandInHeld({ customerId });

		const released = await releaseOnApi({
			autumn: autumnV2_6,
			customerId,
			lockId,
		});
		const handedIn = await stateOnceHandedIn({
			autumn: autumnV2_6,
			customerId,
		});

		expect({ settle: released, ...handedIn }).toEqual(SETTLED_ONCE);
	},
	120_000,
);

test.skipIf(!replicaSetRunsHere)(
	`${chalk.yellowBright("finalize-before-hand-in2: a pre-2.6 release the Atom forwards before its own hand-in leaves no lock held once it lands")}`,
	async () => {
		const customerId = "finalize-before-hand-in2";
		const { atom, lockId, autumnV2_6 } = await lockWithHandInHeld({
			customerId,
		});

		const released = await finalizeOnAtom({
			atom,
			customerId,
			lockId,
			apiVersion: ApiVersion.V2_5,
		});
		expect(released.forwarded).toBe("lock_version");
		const handedIn = await stateOnceHandedIn({
			autumn: autumnV2_6,
			customerId,
		});

		expect({ settle: released.status, ...handedIn }).toEqual(SETTLED_ONCE);
	},
	120_000,
);
