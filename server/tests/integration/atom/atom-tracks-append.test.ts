/**
 * An org's Atom hands Autumn the deductions it granted, on the dev stack.
 *
 * Contract:
 *  1. the same batch handed in twice deducts once (the worker dedups the command), and the subject Autumn then
 *     gives that Atom carries the highest seq it applied from it;
 *  2. Autumn deducts a handed-in track by its own split, exactly as an API track of the same value: the request
 *     names no rows, and rows it names anyway are never read;
 *  3. a body that is not a tracks.append request is 400 unreadable; an unknown token hash is 401 atom_unknown.
 */

import { afterAll, expect, test } from "bun:test";
import { orgToCommandOrg, type TrackCommand } from "@autumn/balance-engine";
import {
	ATOM_SUBJECT_READ_PATH,
	ATOM_TOKEN_HASH_HEADER,
	ATOM_TRACKS_APPEND_PATH,
	AtomTracksAppendErrorCode,
} from "@autumn/byoc";
import type { AtomSubjectBody } from "@autumn/byoc/subjects";
import type { ApiCustomerV5 } from "@autumn/shared";
import { TestFeature } from "@tests/setup/v2Features.js";
import { isBalanceWorkerRoute } from "@tests/utils/balanceWorkerRouteTestUtils.js";
import { items } from "@tests/utils/fixtures/items.js";
import { products } from "@tests/utils/fixtures/products.js";
import { pollUntilAsserted } from "@tests/utils/genUtils.js";
import defaultCtx from "@tests/utils/testInitUtils/createTestContext.js";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario.js";
import chalk from "chalk";
import { atomTokenToHash } from "@/internal/byoc/utils/atomTokenUtils.js";
import { expectBalanceCorrect } from "../utils/expectBalanceCorrect.js";
import { atomTestClient } from "./utils/atomTestClient.js";
import {
	deleteAtomDeployment,
	ensureAtomDeployment,
} from "./utils/ensureAtomDeployment.js";

const autumn = atomTestClient();
const serverUrl = autumn.baseUrl.replace(/\/v1$/, "");

afterAll(async () => {
	await deleteAtomDeployment({ autumn });
});

/** The worker's own track for `value` messages, as an Atom journals the deduction it granted. */
const atomTrack = ({
	customerId,
	value,
}: {
	customerId: string;
	value: number;
}): TrackCommand => {
	const requestId = `atom_req_${crypto.randomUUID()}`;
	const messages = defaultCtx.features.find(
		(feature) => feature.id === TestFeature.Messages,
	);
	return {
		schemaVersion: 1,
		requestId,
		identity: {
			orgId: defaultCtx.org.id,
			env: defaultCtx.env,
			customerId,
			entityId: null,
		},
		occurredAt: Date.now(),
		type: "track",
		org: orgToCommandOrg({ org: defaultCtx.org }),
		commandId: requestId,
		featureId: TestFeature.Messages,
		internalFeatureId: messages?.internal_id ?? "",
		value,
		overageBehavior: "overflow",
		properties: null,
		enforceOverdueBlock: true,
		usageEvent: null,
		idempotency: { key: `track:${requestId}`, ttlMs: 86_400_000 },
	};
};

const postAsAtom = ({
	path,
	tokenHash,
	body,
}: {
	path: string;
	tokenHash: string;
	body: unknown;
}) =>
	fetch(`${serverUrl}${path}`, {
		method: "POST",
		headers: {
			"content-type": "application/json",
			[ATOM_TOKEN_HASH_HEADER]: tokenHash,
		},
		body: JSON.stringify(body),
	});

// A handed-in track only lands through the balance worker's log.
test.skipIf(!isBalanceWorkerRoute())(
	`${chalk.yellowBright("atom-tracks1: the same batch handed in twice deducts once; the Atom's subject then carries its seq")}`,
	async () => {
		const free = products.base({
			id: "free",
			items: [items.monthlyMessages({ includedUsage: 100 })],
		});
		const { customerId } = await initScenario({
			customerId: "atom-tracks1",
			setup: [s.customer({ testClock: false }), s.products({ list: [free] })],
			actions: [s.billing.attach({ productId: free.id })],
		});
		const atom = await ensureAtomDeployment({ autumn });
		const tokenHash = atomTokenToHash({ token: atom.token });
		const append = (body: unknown) =>
			postAsAtom({ path: ATOM_TRACKS_APPEND_PATH, tokenHash, body });

		const batch = {
			tracks: [{ seq: 1, command: atomTrack({ customerId, value: 30 }) }],
		};
		const first = await append(batch);
		const resent = await append(batch);
		const next = await append({
			tracks: [{ seq: 2, command: atomTrack({ customerId, value: 5 }) }],
		});

		expect([first.status, resent.status, next.status]).toEqual([204, 204, 204]);
		// One customer's commands apply in order, so the next track landing means the resend was decided.
		await expectBalanceCorrect({
			customerId,
			featureId: TestFeature.Messages,
			remaining: 65,
		});
		await pollUntilAsserted({
			fetch: async () =>
				(await (
					await postAsAtom({
						path: ATOM_SUBJECT_READ_PATH,
						tokenHash,
						body: { customer_id: customerId, entity_id: null },
					})
				).json()) as AtomSubjectBody,
			assert: (body) => expect(body.atom_seq).toBe(2),
		});
	},
	120_000,
);

test.skipIf(!isBalanceWorkerRoute())(
	`${chalk.yellowBright("atom-tracks2: Autumn splits a handed-in track itself, exactly as an API track; rows the request names are never read")}`,
	async () => {
		const split = products.base({
			id: "split",
			items: [
				items.monthlyMessages({ includedUsage: 100 }),
				items.lifetimeMessages({ includedUsage: 50 }),
			],
		});
		const apiCustomerId = "atom-tracks2-api";
		const { customerId, autumnV2_4 } = await initScenario({
			customerId: "atom-tracks2",
			setup: [
				s.customer({ testClock: false }),
				s.otherCustomers([{ id: apiCustomerId }]),
				s.products({ list: [split] }),
			],
			actions: [
				s.billing.attach({ productId: split.id }),
				s.billing.attach({ productId: split.id, customerId: apiCustomerId }),
			],
		});
		const atom = await ensureAtomDeployment({ autumn });
		const before = await autumnV2_4.customers.get<ApiCustomerV5>(customerId);
		const lifetimeBucket = before.balances[
			TestFeature.Messages
		]?.breakdown?.find((bucket) => bucket.reset === null);

		// A split the Atom might have drawn, riding on the command: everything off the lifetime grant.
		const handedIn = await postAsAtom({
			path: ATOM_TRACKS_APPEND_PATH,
			tokenHash: atomTokenToHash({ token: atom.token }),
			body: {
				tracks: [
					{
						seq: 1,
						command: {
							...atomTrack({ customerId, value: 120 }),
							deltas: [{ id: lifetimeBucket?.id, value: 120 }],
						},
					},
				],
			},
		});
		await autumnV2_4.track({
			customer_id: apiCustomerId,
			feature_id: TestFeature.Messages,
			value: 120,
			overage_behavior: "overflow",
		});

		expect(handedIn.status).toBe(204);
		const remainingByBucket = async (id: string) => {
			await expectBalanceCorrect({
				customerId: id,
				featureId: TestFeature.Messages,
				remaining: 30,
				autumn: autumnV2_4,
			});
			const customer = await autumnV2_4.customers.get<ApiCustomerV5>(id);
			return customer.balances[TestFeature.Messages]?.breakdown?.map(
				(bucket) => ({
					lifetime: bucket.reset === null,
					remaining: bucket.remaining,
				}),
			);
		};
		expect(await remainingByBucket(customerId)).toEqual(
			await remainingByBucket(apiCustomerId),
		);
	},
	120_000,
);

test(`${chalk.yellowBright("atom-tracks3: an unreadable body is 400 unreadable; an unknown token hash is 401 atom_unknown")}`, async () => {
	const atom = await ensureAtomDeployment({ autumn });
	const unreadable = await postAsAtom({
		path: ATOM_TRACKS_APPEND_PATH,
		tokenHash: atomTokenToHash({ token: atom.token }),
		body: { tracks: [{ seq: 1, command: { type: "track" } }] },
	});
	const unknownAtom = await postAsAtom({
		path: ATOM_TRACKS_APPEND_PATH,
		tokenHash: "f".repeat(64),
		body: { tracks: [] },
	});

	expect(unreadable.status).toBe(400);
	expect(await unreadable.json()).toMatchObject({
		code: AtomTracksAppendErrorCode.Unreadable,
	});
	expect(unknownAtom.status).toBe(401);
	expect(await unknownAtom.json()).toMatchObject({
		code: AtomTracksAppendErrorCode.AtomUnknown,
	});
});
