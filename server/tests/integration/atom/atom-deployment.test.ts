/**
 * An org's Atom on the dev stack, end to end.
 *
 * Contract:
 *  1. a track through the API reaches the Atom: its check answers off the new balance;
 *  2. the same for an entity: its check answers off the entity's own balance, and a second entity's is untouched;
 *  3. byoc.create_atom hands back an endpoint and a token, and only that token opens the Atom;
 *     creating again returns the same Atom; byoc.delete_atom forgets it and the token stops working;
 *  4. an Atom, by its token hash, learns which of its secret keys are not its own org and env's.
 *
 * The scenarios use the test org's one Atom, so they run in order, in this one file.
 */

import { afterAll, beforeAll, expect, test } from "bun:test";
import { ATOM_KEYS_PATH, ATOM_TOKEN_HASH_HEADER } from "@autumn/byoc";
import {
	AppEnv,
	apiKeys,
	ByocCacheStatus,
	organizations,
} from "@autumn/shared";
import { TestFeature } from "@tests/setup/v2Features.js";
import { isBalanceWorkerRoute } from "@tests/utils/balanceWorkerRouteTestUtils.js";
import { items } from "@tests/utils/fixtures/items.js";
import { products } from "@tests/utils/fixtures/products.js";
import { pollUntilAsserted } from "@tests/utils/genUtils.js";
import defaultCtx from "@tests/utils/testInitUtils/createTestContext.js";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario.js";
import chalk from "chalk";
import { eq } from "drizzle-orm";
import { initDrizzle } from "@/db/initDrizzle.js";
import { AutumnInt } from "@/external/autumn/autumnCli.js";
import { atomTokenToHash } from "@/internal/byoc/utils/atomTokenUtils.js";
import {
	ApiKeyPrefix,
	createKey,
	hashApiKey,
} from "@/internal/dev/apiKeys/apiKeyUtils.js";
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
		expect(afterDelete).toMatchObject({ cache: null });
		// Another Atom thread sees the removal on its next tenant re-read, about a second later.
		await pollUntilAsserted({
			fetch: () => checkOnAtom(anyCheck),
			assert: ({ status }) => expect(status).toBe(401),
			timeoutMs: 10_000,
		});
	},
);

test(`${chalk.yellowBright("atom-deployment4: an Atom learns which of its secret keys are not its org and env's")}`, async () => {
	const { db } = initDrizzle();
	const atom = await ensureAtomDeployment({ autumn });
	const otherOrgId = `org_atom_keys_${crypto.randomUUID()}`;
	await db.insert(organizations).values({
		id: otherOrgId,
		slug: otherOrgId,
		name: "Atom keys other org",
		logo: "",
		createdAt: new Date(),
		metadata: "",
	});
	const newKey = ({ orgId, env }: { orgId: string; env: AppEnv }) =>
		createKey({
			db,
			env,
			name: "Atom keys test key",
			orgId,
			prefix: env === AppEnv.Live ? ApiKeyPrefix.Live : ApiKeyPrefix.Sandbox,
			meta: {},
		});
	const liveKey = await newKey({ orgId: defaultCtx.org.id, env: AppEnv.Live });
	const otherOrgKey = await newKey({ orgId: otherOrgId, env: AppEnv.Sandbox });
	const checkKeys = ({
		tokenHash,
		keyHashes,
	}: {
		tokenHash: string;
		keyHashes: string[];
	}) =>
		fetch(`${autumn.baseUrl.replace(/\/v1$/, "")}${ATOM_KEYS_PATH}`, {
			method: "POST",
			headers: {
				"content-type": "application/json",
				[ATOM_TOKEN_HASH_HEADER]: tokenHash,
			},
			body: JSON.stringify({ key_hashes: keyHashes }),
		});

	try {
		const own = hashApiKey(defaultCtx.orgSecretKey);
		const live = hashApiKey(liveKey);
		const otherOrg = hashApiKey(otherOrgKey);
		const neverIssued = hashApiKey("am_sk_test_never_issued");
		const reply = await checkKeys({
			tokenHash: atomTokenToHash({ token: atom.token }),
			keyHashes: [own, live, otherOrg, neverIssued],
		});
		const unknownAtom = await checkKeys({
			tokenHash: "f".repeat(64),
			keyHashes: [own],
		});

		expect(reply.status).toBe(200);
		expect(await reply.json()).toEqual({
			invalid_key_hashes: [live, otherOrg, neverIssued],
		});
		expect(unknownAtom.status).toBe(401);
	} finally {
		await db.delete(apiKeys).where(eq(apiKeys.hashed_key, hashApiKey(liveKey)));
		await db.delete(apiKeys).where(eq(apiKeys.org_id, otherOrgId));
		await db.delete(organizations).where(eq(organizations.id, otherOrgId));
	}
});
