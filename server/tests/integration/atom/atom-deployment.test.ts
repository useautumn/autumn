/**
 * An org's Atom on the dev stack, end to end.
 *
 * Contract:
 *  1. a track through the API reaches the Atom: its check answers off the new balance;
 *  2. byoc.create_atom hands back an endpoint and a token, and only that token opens the Atom;
 *     creating again returns the same Atom; byoc.delete_atom forgets it and the token stops working.
 *
 * Both scenarios use the test org's one Atom, so they run in order, in this one file.
 */

import { afterAll, beforeAll, expect, test } from "bun:test";
import { ByocCacheStatus } from "@autumn/shared";
import { TestFeature } from "@tests/setup/v2Features.js";
import { isBalanceWorkerRoute } from "@tests/utils/balanceWorkerRouteTestUtils.js";
import { items } from "@tests/utils/fixtures/items.js";
import { products } from "@tests/utils/fixtures/products.js";
import defaultCtx from "@tests/utils/testInitUtils/createTestContext.js";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario.js";
import chalk from "chalk";
import { AutumnInt } from "@/external/autumn/autumnCli.js";
import {
	deleteAtomDeployment,
	ensureAtomDeployment,
} from "./utils/ensureAtomDeployment.js";
import {
	checkOnAtom,
	expectAtomCheckCorrect,
} from "./utils/expectAtomCheckCorrect.js";

const autumn = new AutumnInt({ secretKey: defaultCtx.orgSecretKey });

beforeAll(async () => {
	await deleteAtomDeployment({ autumn });
});

afterAll(async () => {
	await deleteAtomDeployment({ autumn });
});

// A track only reaches the Atom through the balance worker's log.
test.skipIf(!isBalanceWorkerRoute())(
	`${chalk.yellowBright("atom-deployment1: a track through the API reaches the Atom's check")}`,
	async () => {
		const free = products.base({
			id: "free",
			items: [items.monthlyMessages({ includedUsage: 100 })],
		});
		const { customerId, autumnV2_4 } = await initScenario({
			customerId: "atom-deployment1",
			setup: [s.customer({ testClock: false }), s.products({ list: [free] })],
			actions: [s.billing.attach({ productId: free.id })],
		});
		const atom = await ensureAtomDeployment({ autumn });
		const messages = { atom, customerId, featureId: TestFeature.Messages };

		await autumnV2_4.track({
			customer_id: customerId,
			feature_id: TestFeature.Messages,
			value: 40,
		});
		await expectAtomCheckCorrect({
			...messages,
			requiredBalance: 60,
			allowed: true,
		});
		await expectAtomCheckCorrect({
			...messages,
			requiredBalance: 61,
			allowed: false,
		});

		await autumnV2_4.track({
			customer_id: customerId,
			feature_id: TestFeature.Messages,
			value: 60,
		});
		await expectAtomCheckCorrect({
			...messages,
			requiredBalance: 1,
			allowed: false,
		});
	},
	120_000,
);

test(`${chalk.yellowBright("atom-deployment2: only the token opens the Atom → create again is a no-op → delete → gone")}`, async () => {
	const atom = await ensureAtomDeployment({ autumn });
	const anyCheck = { atom, customerId: "unknown", featureId: "messages" };

	const withToken = await checkOnAtom(anyCheck);
	const withoutToken = await checkOnAtom({ ...anyCheck, token: null });
	const withWrongToken = await checkOnAtom({ ...anyCheck, token: "atom_no" });
	expect(withToken.status).toBe(200);
	expect(withoutToken.status).toBe(401);
	expect(withWrongToken.status).toBe(401);

	const fetched = await autumn.post("/byoc.get_atom", {});
	expect(fetched.cache).toMatchObject({
		env: "sandbox",
		status: ByocCacheStatus.Ready,
		endpoint_url: atom.endpointUrl,
	});
	expect(fetched.cache.token).toBeUndefined();

	const again = await autumn.post("/byoc.create_atom", {});
	expect(again).toMatchObject({
		deployment_id: fetched.cache.deployment_id,
		setup_url: null,
		token: atom.token,
	});

	await deleteAtomDeployment({ autumn });
	const afterDelete = await autumn.post("/byoc.get_atom", {});
	const checkAfterDelete = await checkOnAtom(anyCheck);
	expect(afterDelete).toEqual({ cache: null });
	expect(checkAfterDelete.status).toBe(401);
});
