/**
 * A lock taken on an org's Atom, on the dev stack.
 *
 * Contract:
 *  1. a customer's own lock is taken on the Atom, not the API: the Atom's view holds the units at once, and its
 *     journal hands the locked track to Autumn with its writer and seq, where it lands as one balance_locks row.
 */

import { afterAll, expect, test } from "bun:test";
import { balanceLocks, customers } from "@autumn/shared";
import { TestFeature } from "@tests/setup/v2Features.js";
import { isBalanceWorkerRoute } from "@tests/utils/balanceWorkerRouteTestUtils.js";
import { items } from "@tests/utils/fixtures/items.js";
import { products } from "@tests/utils/fixtures/products.js";
import { pollUntilAsserted } from "@tests/utils/genUtils.js";
import defaultCtx from "@tests/utils/testInitUtils/createTestContext.js";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario.js";
import chalk from "chalk";
import { and, eq } from "drizzle-orm";
import { expectBalanceCorrect } from "../utils/expectBalanceCorrect.js";
import { atomTestClient } from "./utils/atomTestClient.js";
import {
	atomIsHosted,
	deleteAtomDeployment,
	ensureAtomDeployment,
} from "./utils/ensureAtomDeployment.js";
import { expectAtomBalance } from "./utils/expectAtomBalance.js";
import { checkOnAtom } from "./utils/expectAtomCheckCorrect.js";

const autumn = atomTestClient();

afterAll(async () => {
	await deleteAtomDeployment({ autumn });
});

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
			fetch: () =>
				defaultCtx.db
					.select({ atomSeqs: customers.atom_seqs })
					.from(customers)
					.where(
						and(
							eq(customers.org_id, defaultCtx.org.id),
							eq(customers.env, defaultCtx.env),
							eq(customers.id, customerId),
						),
					),
			assert: ([row]) =>
				expect(
					Object.values(row?.atomSeqs ?? {}).flatMap((writerSeqs) =>
						Object.values(writerSeqs),
					),
				).toEqual([1]),
		});
		await expectBalanceCorrect({
			customerId,
			featureId: TestFeature.Messages,
			remaining: 70,
		});
	},
	120_000,
);
