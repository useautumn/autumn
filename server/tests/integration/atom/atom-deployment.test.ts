/**
 * An org's Atom on the dev stack, end to end.
 *
 * Contract:
 *  1. a track through the API reaches the Atom: its check answers off the new balance;
 *  2. the same for an entity: its check answers off the entity's own balance, and a second entity's is untouched;
 *  3. byoc.create_atom hands back an endpoint and a token, and only that token opens the Atom;
 *     creating again returns the same Atom; byoc.delete_atom forgets it and the token stops working.
 *
 * The scenarios use the test org's one Atom, so they run in order, in this one file.
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
	atomIsHosted,
	deleteAtomDeployment,
	ensureAtomDeployment,
} from "./utils/ensureAtomDeployment.js";
import {
	checkOnAtom,
	expectAtomCheckCorrect,
} from "./utils/expectAtomCheckCorrect.js";

const autumn = new AutumnInt({ secretKey: defaultCtx.orgSecretKey });

// Every scenario starts from and ends with no Atom, which only the dev stack's own Atom can afford.
const hostedAtom = atomIsHosted();

beforeAll(async () => {
	await deleteAtomDeployment({ autumn });
});

afterAll(async () => {
	await deleteAtomDeployment({ autumn });
});

// A track only reaches the Atom through the balance worker's log.
test.skipIf(!isBalanceWorkerRoute() || hostedAtom)(
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
		const messages = {
			atom,
			secretKey: defaultCtx.orgSecretKey,
			customerId,
			featureId: TestFeature.Messages,
		};

		await autumnV2_4.track({
			customer_id: customerId,
			feature_id: TestFeature.Messages,
			value: 40,
		});
		const atomResponse = await expectAtomCheckCorrect({
			...messages,
			requiredBalance: 60,
			allowed: true,
		});
		await expectAtomCheckCorrect({
			...messages,
			requiredBalance: 61,
			allowed: false,
		});

		// The Atom answers exactly what the API answers for the same check.
		const apiResponse = await autumnV2_4.post("/balances.check", {
			customer_id: customerId,
			feature_id: TestFeature.Messages,
			required_balance: 60,
		});
		expect(atomResponse).toEqual(apiResponse);

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

// A track only reaches the Atom through the balance worker's log.
test.skipIf(!isBalanceWorkerRoute() || hostedAtom)(
	`${chalk.yellowBright("atom-deployment2: a track on an entity reaches the Atom's check for that entity")}`,
	async () => {
		const free = products.base({
			id: "free",
			items: [items.monthlyMessages({ includedUsage: 100 })],
		});
		const { customerId, entities, autumnV2_4 } = await initScenario({
			customerId: "atom-deployment2",
			setup: [
				s.customer({ testClock: false }),
				s.products({ list: [free] }),
				s.entities({ count: 2, featureId: TestFeature.Users }),
			],
			actions: [
				s.billing.attach({ productId: free.id, entityIndex: 0 }),
				s.billing.attach({ productId: free.id, entityIndex: 1 }),
			],
		});
		const atom = await ensureAtomDeployment({ autumn });
		const [tracked, untouched] = entities;
		const messages = {
			atom,
			secretKey: defaultCtx.orgSecretKey,
			customerId,
			featureId: TestFeature.Messages,
		};

		await autumnV2_4.track({
			customer_id: customerId,
			entity_id: tracked.id,
			feature_id: TestFeature.Messages,
			value: 40,
		});
		const atomResponse = await expectAtomCheckCorrect({
			...messages,
			entityId: tracked.id,
			requiredBalance: 60,
			allowed: true,
		});
		await expectAtomCheckCorrect({
			...messages,
			entityId: tracked.id,
			requiredBalance: 61,
			allowed: false,
		});

		// The Atom answers exactly what the API answers for the same entity check.
		const apiResponse = await autumnV2_4.post("/balances.check", {
			customer_id: customerId,
			entity_id: tracked.id,
			feature_id: TestFeature.Messages,
			required_balance: 60,
		});
		expect(atomResponse).toEqual(apiResponse);

		// The other entity was never tracked, so the Atom has not been sent it: the API answers, through the Atom.
		const other = await checkOnAtom({
			...messages,
			entityId: untouched.id,
			requiredBalance: 100,
		});
		expect(other.forwarded).toBe("entity_not_stored");
		expect(other.body).toMatchObject({ allowed: true });
	},
	120_000,
);

test.skipIf(hostedAtom)(
	`${chalk.yellowBright("atom-deployment3: only the token opens the Atom → create again is a no-op → delete → gone")}`,
	async () => {
		const atom = await ensureAtomDeployment({ autumn });
		const anyCheck = {
			atom,
			secretKey: defaultCtx.orgSecretKey,
			customerId: "unknown",
			featureId: "messages",
		};

		const withToken = await checkOnAtom(anyCheck);
		const withoutToken = await checkOnAtom({ ...anyCheck, token: null });
		const withWrongToken = await checkOnAtom({ ...anyCheck, token: "atom_no" });
		// The Atom holds no such customer, so with its token the API answers through it.
		expect(withToken.forwarded).toBe("customer_not_stored");
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
	},
);
