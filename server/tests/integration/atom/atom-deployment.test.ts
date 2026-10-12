/**
 * An org's Atom on the dev stack, end to end.
 *
 * Contract:
 *  1. a track through the API reaches the Atom: its check answers off the new balance;
 *  2. the same for an entity: its check answers off the entity's own balance, and a second entity's is untouched;
 *  3. byoc.create_atom hands back an endpoint and a token, and only that token opens the Atom;
 *     creating again returns the same Atom; byoc.delete_atom forgets it and the token stops working;
 *  4. an Atom, by its token hash, learns which of its secret keys are not its own org and env's;
 *  5. evicting a customer makes its entity's check stale: the Atom forwards it (entity_stale) and pulls the entity,
 *     then answers it itself again, as it does after the entity's next track;
 *  6. an entity's own changes reach its check: the Atom answers off a balance update; new billing controls come with
 *     an evict, so the Atom forwards the entity until it pulls it again or the next track lands, then answers off them;
 *  7. a track on the customer reaches the check of its entity, which the Atom keeps answering itself;
 *  8. a customer the Atom does not hold: its first check is forwarded (customer_not_stored), the Atom pulls the
 *     customer from Autumn by its token hash, and answers the next checks itself; /health counts the pull and the fill.
 * From 5 on, every reply the Atom gives equals the API's answer to the same check.
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
	ResetInterval,
} from "@autumn/shared";
import { TestFeature } from "@tests/setup/v2Features.js";
import { isBalanceWorkerRoute } from "@tests/utils/balanceWorkerRouteTestUtils.js";
import { items } from "@tests/utils/fixtures/items.js";
import { products } from "@tests/utils/fixtures/products.js";
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
		const checkAfterDelete = await checkOnAtom(anyCheck);
		expect(afterDelete).toMatchObject({ cache: null });
		expect(checkAfterDelete.status).toBe(401);
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

/** A customer with one entity and 100 monthly messages on the entity or the customer, and that entity's check on the Atom. */
const initEntityOnAtom = async ({
	customerId,
	plansOn,
}: {
	customerId: string;
	plansOn: "entity" | "customer";
}) => {
	const free = products.base({
		id: "free",
		items: [items.monthlyMessages({ includedUsage: 100 })],
	});
	const { entities, autumnV2_4 } = await initScenario({
		customerId,
		setup: [
			s.customer({ testClock: false }),
			s.products({ list: [free] }),
			s.entities({ count: 1, featureId: TestFeature.Users }),
		],
		actions: [
			s.billing.attach({
				productId: free.id,
				entityIndex: plansOn === "entity" ? 0 : undefined,
			}),
		],
	});
	const atom = await ensureAtomDeployment({ autumn });
	const entityId = entities[0].id;
	return {
		autumnV2_4,
		entityId,
		entityCheck: {
			atom,
			secretKey: defaultCtx.orgSecretKey,
			customerId,
			entityId,
			featureId: TestFeature.Messages,
			api: autumnV2_4,
		},
		trackEntity: (value: number) =>
			autumnV2_4.track({
				customer_id: customerId,
				entity_id: entityId,
				feature_id: TestFeature.Messages,
				value,
			}),
	};
};

// An evict reaches the Atom only through the balance worker's log.
test.skipIf(!isBalanceWorkerRoute() || hostedAtom)(
	`${chalk.yellowBright("atom-deployment5: evicting a customer makes its entity's check stale on the Atom until the entity's next track")}`,
	async () => {
		const customerId = "atom-deployment5";
		const { autumnV2_4, entityCheck, trackEntity } = await initEntityOnAtom({
			customerId,
			plansOn: "entity",
		});

		await trackEntity(40);
		await expectAtomCheckCorrect({
			...entityCheck,
			requiredBalance: 61,
			allowed: false,
		});

		// A bare evict: an attach would also write the entity's state, which makes it current again.
		await autumnV2_4.post("/customers/clear_cache", {
			customer_id: customerId,
		});
		await expectAtomCheckCorrect({
			...entityCheck,
			requiredBalance: 61,
			allowed: false,
			forwarded: "entity_stale",
		});

		await trackEntity(10);
		await expectAtomCheckCorrect({
			...entityCheck,
			requiredBalance: 51,
			allowed: false,
		});
		await expectAtomCheckCorrect({
			...entityCheck,
			requiredBalance: 50,
			allowed: true,
		});
	},
	120_000,
);

test.skipIf(!isBalanceWorkerRoute() || hostedAtom)(
	`${chalk.yellowBright("atom-deployment6: an entity's balance update and new billing controls reach its check on the Atom")}`,
	async () => {
		const customerId = "atom-deployment6";
		const { autumnV2_4, entityId, entityCheck, trackEntity } =
			await initEntityOnAtom({ customerId, plansOn: "entity" });

		await trackEntity(10);
		await expectAtomCheckCorrect({
			...entityCheck,
			requiredBalance: 91,
			allowed: false,
		});

		// The worker writes the update and logs it, so herald pushes the entity and the Atom answers off it.
		await autumnV2_4.balances.update({
			customer_id: customerId,
			entity_id: entityId,
			feature_id: TestFeature.Messages,
			remaining: 50,
		});
		await expectAtomCheckCorrect({
			...entityCheck,
			requiredBalance: 51,
			allowed: false,
		});
		await expectAtomCheckCorrect({
			...entityCheck,
			requiredBalance: 50,
			allowed: true,
		});

		// The worker reloads new controls through an evict, so the Atom forwards the entity until its next track.
		// The balance allows 35 and the cap of 30 refuses it, whatever its window counted before.
		await autumnV2_4.entities.update(customerId, entityId, {
			billing_controls: {
				usage_limits: [
					{
						feature_id: TestFeature.Messages,
						enabled: true,
						limit: 30,
						interval: ResetInterval.Month,
					},
				],
			},
		});
		await expectAtomCheckCorrect({
			...entityCheck,
			requiredBalance: 35,
			allowed: false,
			forwarded: "entity_stale",
		});
		await trackEntity(5);
		await expectAtomCheckCorrect({
			...entityCheck,
			requiredBalance: 35,
			allowed: false,
		});
		await expectAtomCheckCorrect({
			...entityCheck,
			requiredBalance: 5,
			allowed: true,
		});
	},
	120_000,
);

test.skipIf(!isBalanceWorkerRoute() || hostedAtom)(
	`${chalk.yellowBright("atom-deployment7: a track on the customer reaches its entity's check on the Atom")}`,
	async () => {
		const customerId = "atom-deployment7";
		const { autumnV2_4, entityCheck, trackEntity } = await initEntityOnAtom({
			customerId,
			plansOn: "customer",
		});

		// The entity's own track is what first sends it to the Atom.
		await trackEntity(10);
		await expectAtomCheckCorrect({
			...entityCheck,
			requiredBalance: 91,
			allowed: false,
		});

		await autumnV2_4.track({
			customer_id: customerId,
			feature_id: TestFeature.Messages,
			value: 40,
		});
		await expectAtomCheckCorrect({
			...entityCheck,
			requiredBalance: 51,
			allowed: false,
		});
		await expectAtomCheckCorrect({
			...entityCheck,
			requiredBalance: 50,
			allowed: true,
		});
	},
	120_000,
);

/** The Atom's pull counters, summed over its threads. */
const readPullCounters = async ({
	atom,
}: {
	atom: { endpointUrl: string };
}) => {
	const health = await (await fetch(`${atom.endpointUrl}/health`)).json();
	const sumOf = (field: string): number =>
		health.threads.reduce(
			(sum: number, thread: Record<string, number>) => sum + thread[field],
			0,
		);
	return {
		misses: sumOf("subjectMisses"),
		pulls: sumOf("subjectPulls"),
		fills: sumOf("subjectFills"),
	};
};

// The pull reads the subject from its balance worker, so only a worker-routed customer is pulled.
test.skipIf(!isBalanceWorkerRoute() || hostedAtom)(
	`${chalk.yellowBright("atom-deployment8: a customer the Atom does not hold is forwarded once, pulled, then answered by the Atom")}`,
	async () => {
		const customerId = "atom-deployment8";
		const free = products.base({
			id: "free",
			items: [items.monthlyMessages({ includedUsage: 100 })],
		});
		// Every change to the customer lands before its Atom exists, so herald has nothing to push it afterwards.
		await deleteAtomDeployment({ autumn });
		const { autumnV2_4 } = await initScenario({
			customerId,
			setup: [s.customer({ testClock: false }), s.products({ list: [free] })],
			actions: [
				s.billing.attach({ productId: free.id }),
				s.track({ featureId: TestFeature.Messages, value: 30 }),
			],
		});
		const atom = await ensureAtomDeployment({ autumn });
		const messages = {
			atom,
			secretKey: defaultCtx.orgSecretKey,
			customerId,
			featureId: TestFeature.Messages,
			api: autumnV2_4,
		};
		const before = await readPullCounters({ atom });

		const first = await checkOnAtom({ ...messages, requiredBalance: 70 });
		expect(first.forwarded).toBe("customer_not_stored");
		expect(first.body).toMatchObject({ allowed: true });

		await expectAtomCheckCorrect({
			...messages,
			requiredBalance: 70,
			allowed: true,
		});
		await expectAtomCheckCorrect({
			...messages,
			requiredBalance: 71,
			allowed: false,
		});
		const after = await readPullCounters({ atom });
		expect(after.misses - before.misses).toBeGreaterThanOrEqual(1);
		expect(after.pulls - before.pulls).toBeGreaterThanOrEqual(1);
		expect(after.fills - before.fills).toBeGreaterThanOrEqual(1);
	},
	120_000,
);
