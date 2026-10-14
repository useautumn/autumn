/**
 * A finalize the Atom cannot run for a transport reason, before its lock's hand-in has landed at Autumn.
 *
 * Contract:
 *  1. a finalize handed on by a replica whose owner is stopping (its peer port shedding) is answered 503 with
 *     x-atom-forwarded: the caller retries the Atom rather than ask the API, which holds no row for the lock yet. Once
 *     the hand-in lands, the retried finalize settles the lock.
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
import { expectAutumnLockState } from "../utils/autumnLockState.js";
import { expectAtomBalance } from "../utils/expectAtomBalance.js";
import { checkOnAtom } from "../utils/expectAtomCheckCorrect.js";
import { finalizeOnAtom } from "../utils/finalizeOnAtom.js";
import {
	replicaSetRunsHere,
	useReplicaSet,
} from "../utils/replicaSet/useReplicaSet.js";

const replicaSet = useReplicaSet({ size: 2 });

const LOCKED = 30;

test.skipIf(!replicaSetRunsHere)(
	`${chalk.yellowBright("finalize-transport1: a finalize handed on to a stopping owner before its lock's hand-in lands is a 503 the caller retries at the Atom, never the API's lock_not_found")}`,
	async () => {
		const customerId = "finalize-transport1";
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
		const owner = await replicaSet().ownerIndexOf({ customerId });
		const other = 1 - owner;
		for (const index of [owner, other])
			await expectAtomBalance({
				atom: replicaSet().replica(index),
				customerId,
				remaining: 100,
			});

		replicaSet().holdHandIns();
		const locked = await checkOnAtom({
			atom: replicaSet().replica(owner),
			secretKey: defaultCtx.orgSecretKey,
			customerId,
			featureId: TestFeature.Messages,
			requiredBalance: LOCKED,
			lock: { enabled: true, lock_id: lockId },
		});
		expect(locked).toMatchObject({ forwarded: null, body: { allowed: true } });

		// The other replica reads its peers now, so its ring still names the owner for the next few seconds.
		const viaOther = await checkOnAtom({
			atom: replicaSet().replica(other),
			secretKey: defaultCtx.orgSecretKey,
			customerId,
			featureId: TestFeature.Messages,
		});
		expect(viaOther.proxied).toBe("owner");
		// Its hand-in held, the owner drains: its public port closes and its peer port sheds what is handed on.
		const stopped = replicaSet().stop(owner);
		await pollUntilAsserted({
			fetch: () => replicaSet().health(owner),
			assert: (health) => expect(health).toBe("down"),
		});

		const finalized = await finalizeOnAtom({
			atom: replicaSet().replica(other),
			customerId,
			lockId,
			action: "confirm",
		});
		expect(finalized).toMatchObject({
			status: 503,
			forwarded: "owner_unavailable",
			body: { code: "atom_unavailable" },
		});

		await replicaSet().releaseHandIns();
		await stopped;
		await pollUntilAsserted({
			fetch: () =>
				finalizeOnAtom({
					atom: replicaSet().replica(other),
					customerId,
					lockId,
					action: "confirm",
				}),
			assert: (retried) => expect(retried.status).toBe(200),
		});
		await expectAutumnLockState({ customerId, openLockIds: [] });
		const customer = await autumnV2_6.customers.get<ApiCustomerV5>(customerId);
		expect(customer.balances[TestFeature.Messages]?.usage).toBe(LOCKED);
	},
	120_000,
);
