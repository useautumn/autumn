/**
 * A lock settled on the other path from the one that took it, on the dev stack's Atom.
 *
 * Contract:
 *  1. a lock the API took and a finalize sent to the Atom: the Atom holds no row for it, so it forwards it
 *     (`lock_not_held`) and the API settles it exactly once: balance, lock row, usage events, the Atom's view; the same
 *     finalize sent again is the API's "Lock not found" and moves nothing;
 *  2. a lock the Atom took and a finalize sent to the API once Autumn holds it: the API settles it once; the push drops
 *     the Atom's own row, so a later finalize on the Atom is forwarded and moves nothing;
 *  3. a finalize before 2.6 names no customer: the Atom forwards it (`lock_version`) and the API settles the Atom's lock
 *     by its lock_id alone, once.
 */

import { afterAll, expect, test } from "bun:test";
import { ApiVersion } from "@autumn/shared";
import { expectCustomerEventsCorrect } from "@tests/integration/balances/utils/events/expectCustomerEventsCorrect.js";
import { TestFeature } from "@tests/setup/v2Features.js";
import { isBalanceWorkerRoute } from "@tests/utils/balanceWorkerRouteTestUtils.js";
import { items } from "@tests/utils/fixtures/items.js";
import { products } from "@tests/utils/fixtures/products.js";
import defaultCtx from "@tests/utils/testInitUtils/createTestContext.js";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario.js";
import chalk from "chalk";
import { expectBalanceCorrect } from "../../utils/expectBalanceCorrect.js";
import { atomTestClient } from "../utils/atomTestClient.js";
import { expectAutumnLockState } from "../utils/autumnLockState.js";
import {
	atomIsHosted,
	deleteAtomDeployment,
	ensureAtomDeployment,
} from "../utils/ensureAtomDeployment.js";
import { expectAtomBalance } from "../utils/expectAtomBalance.js";
import { checkOnAtom } from "../utils/expectAtomCheckCorrect.js";
import { finalizeOnAtom } from "../utils/finalizeOnAtom.js";

const autumn = atomTestClient();

afterAll(async () => {
	await deleteAtomDeployment({ autumn });
});

const LOCKED = 30;
const CONFIRMED = 20;

const freeMessages = () =>
	products.base({
		id: "free",
		items: [items.monthlyMessages({ includedUsage: 100 })],
	});

/** A customer with 100 monthly messages, and the org's Atom answering for it. */
const initCustomer = async ({ customerId }: { customerId: string }) => {
	const free = freeMessages();
	const scenario = await initScenario({
		customerId,
		setup: [s.customer({ testClock: false }), s.products({ list: [free] })],
		actions: [s.billing.attach({ productId: free.id })],
	});
	const atom = await ensureAtomDeployment({ autumn });
	await expectAtomBalance({ atom, customerId, remaining: 100 });
	return { ...scenario, atom };
};

const lockOnAtom = async ({
	atom,
	customerId,
	lockId,
}: {
	atom: Awaited<ReturnType<typeof initCustomer>>["atom"];
	customerId: string;
	lockId: string;
}) => {
	const locked = await checkOnAtom({
		atom,
		secretKey: defaultCtx.orgSecretKey,
		customerId,
		featureId: TestFeature.Messages,
		requiredBalance: LOCKED,
		lock: { enabled: true, lock_id: lockId },
	});
	expect(locked.forwarded).toBeNull();
	expect(locked.body).toMatchObject({ allowed: true });
	// Autumn holds the lock once the Atom's hand-in landed.
	await expectAutumnLockState({
		customerId,
		openLockIds: [lockId],
		atomSeqs: [1],
	});
};

// Only the dev stack's own Atom hands in through this server's worker.
test.skipIf(!isBalanceWorkerRoute() || atomIsHosted())(
	`${chalk.yellowBright("xpath-finalize1: a lock the API took, finalized on the Atom, is forwarded and settled once")}`,
	async () => {
		const customerId = "xpath-finalize1";
		const lockId = `${customerId}-lock`;
		const { atom, autumnV2_6 } = await initCustomer({ customerId });

		await autumnV2_6.check({
			customer_id: customerId,
			feature_id: TestFeature.Messages,
			required_balance: LOCKED,
			lock: { enabled: true, lock_id: lockId },
		});
		await expectAtomBalance({ atom, customerId, remaining: 100 - LOCKED });

		const confirmed = await finalizeOnAtom({
			atom,
			customerId,
			lockId,
			action: "confirm",
			overrideValue: CONFIRMED,
		});
		expect(confirmed).toEqual({
			status: 200,
			forwarded: "lock_not_held",
			body: { success: true },
		});

		const resent = await finalizeOnAtom({
			atom,
			customerId,
			lockId,
			action: "confirm",
			overrideValue: CONFIRMED,
		});
		expect(resent.forwarded).toBe("lock_not_held");
		expect(resent.status).toBeGreaterThanOrEqual(400);

		await expectBalanceCorrect({
			customerId,
			featureId: TestFeature.Messages,
			remaining: 100 - CONFIRMED,
		});
		await expectAutumnLockState({ customerId, openLockIds: [], atomSeqs: [] });
		await expectAtomBalance({ atom, customerId, remaining: 100 - CONFIRMED });
		await expectCustomerEventsCorrect({
			customerId,
			events: [{ value: CONFIRMED - LOCKED }, { value: LOCKED }],
		});
	},
	120_000,
);

test.skipIf(!isBalanceWorkerRoute() || atomIsHosted())(
	`${chalk.yellowBright("xpath-finalize2: a lock the Atom took, finalized on the API after its hand-in, is settled once; the Atom then forwards")}`,
	async () => {
		const customerId = "xpath-finalize2";
		const lockId = `${customerId}-lock`;
		const { atom, autumnV2_6 } = await initCustomer({ customerId });
		await lockOnAtom({ atom, customerId, lockId });

		await autumnV2_6.balances.finalize({
			customer_id: customerId,
			lock_id: lockId,
			action: "confirm",
			override_value: CONFIRMED,
		});

		await expectBalanceCorrect({
			customerId,
			featureId: TestFeature.Messages,
			remaining: 100 - CONFIRMED,
		});
		// The push shows the lock settled, so the Atom drops its own row for it.
		await expectAtomBalance({ atom, customerId, remaining: 100 - CONFIRMED });

		const onAtom = await finalizeOnAtom({ atom, customerId, lockId });
		expect(onAtom.forwarded).toBe("lock_not_held");
		expect(onAtom.status).toBeGreaterThanOrEqual(400);

		await expectAutumnLockState({ customerId, openLockIds: [], atomSeqs: [1] });
		await expectBalanceCorrect({
			customerId,
			featureId: TestFeature.Messages,
			remaining: 100 - CONFIRMED,
		});
		await expectAtomBalance({ atom, customerId, remaining: 100 - CONFIRMED });
		await expectCustomerEventsCorrect({
			customerId,
			events: [{ value: CONFIRMED - LOCKED }, { value: LOCKED }],
		});
	},
	120_000,
);

test.skipIf(!isBalanceWorkerRoute() || atomIsHosted())(
	`${chalk.yellowBright("xpath-finalize3: a finalize before 2.6 is forwarded and settles the Atom's lock by its lock_id, once")}`,
	async () => {
		const customerId = "xpath-finalize3";
		const lockId = `${customerId}-lock`;
		const { atom } = await initCustomer({ customerId });
		await lockOnAtom({ atom, customerId, lockId });

		const released = await finalizeOnAtom({
			atom,
			customerId,
			lockId,
			apiVersion: ApiVersion.V2_5,
		});
		expect(released).toEqual({
			status: 200,
			forwarded: "lock_version",
			body: { success: true },
		});
		const resent = await finalizeOnAtom({
			atom,
			customerId,
			lockId,
			apiVersion: ApiVersion.V2_5,
		});
		expect(resent.forwarded).toBe("lock_version");
		expect(resent.status).toBeGreaterThanOrEqual(400);

		await expectBalanceCorrect({
			customerId,
			featureId: TestFeature.Messages,
			remaining: 100,
		});
		await expectAutumnLockState({ customerId, openLockIds: [], atomSeqs: [1] });
		await expectAtomBalance({ atom, customerId, remaining: 100 });
	},
	120_000,
);
