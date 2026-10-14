/**
 * An org's Atom hands Autumn the deductions it granted, on the dev stack.
 *
 * Contract:
 *  1. the same batch handed in twice deducts once (the worker dedups the command), and the subject Autumn then
 *     gives that Atom carries the highest seq it applied from that journal; the seq is on the customer's row in
 *     Postgres, so a worker that reads the customer afresh (after a customer update evicts it) still carries it;
 *  2. Autumn deducts a handed-in track by its own split, exactly as an API track of the same value: the request
 *     names no rows, and rows it names anyway are never read;
 *  3. a body that is not a tracks.append request is 400 unreadable; an unknown token hash is 401 atom_unknown;
 *  5. a lock's track and its release in one request settle in order: the lock is taken, then given back;
 *  6. a release of a lock Autumn already settled, or named under another customer, moves nothing; its seq still lands;
 *  7. a confirm above the lock that leaves the balance under its auto top-up threshold tops it up, as the API's would;
 *  4. a journal resent whole, identical or under request ids nothing remembers (an Atom replica restart), deducts
 *     once: a seq the customer already holds from that journal deducts nothing again.
 */

import { afterAll, expect, test } from "bun:test";
import type { TrackCommand } from "@autumn/balance-engine";
import {
	ATOM_SUBJECT_READ_PATH,
	ATOM_TRACKS_APPEND_PATH,
	type AtomFinalize,
	AtomTracksAppendErrorCode,
} from "@autumn/byoc";
import type { AtomSubjectBody } from "@autumn/byoc/subjects";
import { type ApiCustomerV5, customers } from "@autumn/shared";
import { TestFeature } from "@tests/setup/v2Features.js";
import { isBalanceWorkerRoute } from "@tests/utils/balanceWorkerRouteTestUtils.js";
import { items } from "@tests/utils/fixtures/items.js";
import { products } from "@tests/utils/fixtures/products.js";
import { pollUntilAsserted } from "@tests/utils/genUtils.js";
import defaultCtx from "@tests/utils/testInitUtils/createTestContext.js";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario.js";
import chalk from "chalk";
import { and, eq } from "drizzle-orm";
import { atomTokenToHash } from "@/internal/byoc/utils/atomTokenUtils.js";
import { expectBalanceCorrect } from "../utils/expectBalanceCorrect.js";
import { atomFinalizeOf, atomTrack, postAsAtom } from "./utils/atomHandIn.js";
import { atomTestClient } from "./utils/atomTestClient.js";
import {
	deleteAtomDeployment,
	ensureAtomDeployment,
} from "./utils/ensureAtomDeployment.js";

const autumn = atomTestClient();

afterAll(async () => {
	await deleteAtomDeployment({ autumn });
});

// A handed-in track only lands through the balance worker's log.
test.skipIf(!isBalanceWorkerRoute())(
	`${chalk.yellowBright("atom-tracks1: the same batch handed in twice deducts once; the Atom's subject carries its journal's seq, from Postgres too")}`,
	async () => {
		const free = products.base({
			id: "free",
			items: [items.monthlyMessages({ includedUsage: 100 })],
		});
		const { customerId, autumnV2_4 } = await initScenario({
			customerId: "atom-tracks1",
			setup: [s.customer({ testClock: false }), s.products({ list: [free] })],
			actions: [s.billing.attach({ productId: free.id })],
		});
		const atom = await ensureAtomDeployment({ autumn });
		const tokenHash = atomTokenToHash({ token: atom.token });
		const append = (body: unknown) =>
			postAsAtom({ autumn, path: ATOM_TRACKS_APPEND_PATH, tokenHash, body });

		const batch = {
			tracks: [
				{
					writerId: "w_1",
					seq: 1,
					command: atomTrack({ customerId, value: 30 }),
				},
			],
		};
		const first = await append(batch);
		const resent = await append(batch);
		const next = await append({
			tracks: [
				{
					writerId: "w_1",
					seq: 2,
					command: atomTrack({ customerId, value: 5 }),
				},
			],
		});

		expect([first.status, resent.status, next.status]).toEqual([204, 204, 204]);
		// One customer's commands apply in order, so the next track landing means the resend was decided.
		await expectBalanceCorrect({
			customerId,
			featureId: TestFeature.Messages,
			remaining: 65,
		});
		const readAsAtom = async () =>
			(await (
				await postAsAtom({
					autumn,
					path: ATOM_SUBJECT_READ_PATH,
					tokenHash,
					body: { customer_id: customerId, entity_id: null },
				})
			).json()) as AtomSubjectBody;
		await pollUntilAsserted({
			fetch: readAsAtom,
			assert: (body) => expect(body.atom_seqs).toEqual({ w_1: 2 }),
		});

		await pollUntilAsserted({
			fetch: () =>
				defaultCtx.db
					.select({ atom_seqs: customers.atom_seqs })
					.from(customers)
					.where(
						and(
							eq(customers.org_id, defaultCtx.org.id),
							eq(customers.env, defaultCtx.env),
							eq(customers.id, customerId),
						),
					),
			assert: (rows) =>
				expect(Object.values(rows[0]?.atom_seqs ?? {})).toEqual([{ w_1: 2 }]),
		});
		// A customer update evicts the worker's copy; the next read loads the customer from Postgres.
		await autumnV2_4.customers.update(customerId, {
			name: "atom-tracks1 renamed",
		});
		expect((await readAsAtom()).atom_seqs).toEqual({ w_1: 2 });
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
			autumn,
			path: ATOM_TRACKS_APPEND_PATH,
			tokenHash: atomTokenToHash({ token: atom.token }),
			body: {
				tracks: [
					{
						writerId: "w_1",
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
		autumn,
		path: ATOM_TRACKS_APPEND_PATH,
		tokenHash: atomTokenToHash({ token: atom.token }),
		body: {
			tracks: [{ writerId: "w_1", seq: 1, command: { type: "track" } }],
		},
	});
	const unknownAtom = await postAsAtom({
		autumn,
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

// A handed-in track only lands through the balance worker's log.
test.skipIf(!isBalanceWorkerRoute())(
	`${chalk.yellowBright("atom-tracks4: a journal resent whole, identical or under fresh request ids, deducts once")}`,
	async () => {
		const free = products.base({
			id: "free",
			items: [items.monthlyMessages({ includedUsage: 100 })],
		});
		const { customerId } = await initScenario({
			customerId: "atom-tracks4",
			setup: [s.customer({ testClock: false }), s.products({ list: [free] })],
			actions: [s.billing.attach({ productId: free.id })],
		});
		const atom = await ensureAtomDeployment({ autumn });
		const tokenHash = atomTokenToHash({ token: atom.token });
		const writer = `w_${crypto.randomUUID()}`;
		const journal = () =>
			[1, 2].map((seq) => ({
				writerId: writer,
				seq,
				command: atomTrack({ customerId, value: 10 }),
			}));
		const sent = journal();
		const append = (tracks: typeof sent) =>
			postAsAtom({
				autumn,
				path: ATOM_TRACKS_APPEND_PATH,
				tokenHash,
				body: { tracks },
			});

		const replies = [
			await append(sent),
			await append(sent),
			await append(journal()),
		];

		expect(replies.map((reply) => reply.status)).toEqual([204, 204, 204]);
		await pollUntilAsserted({
			fetch: async () =>
				(await (
					await postAsAtom({
						autumn,
						path: ATOM_SUBJECT_READ_PATH,
						tokenHash,
						body: { customer_id: customerId, entity_id: null },
					})
				).json()) as AtomSubjectBody,
			assert: (body) => expect(body.atom_seqs?.[writer]).toBe(2),
		});
		// One customer's commands apply in order: a later seq landing means every resend before it was decided.
		const marker = await append([
			{
				writerId: writer,
				seq: 3,
				command: atomTrack({ customerId, value: 1 }),
			},
		]);
		expect(marker.status).toBe(204);
		await expectBalanceCorrect({
			customerId,
			featureId: TestFeature.Messages,
			remaining: 79,
		});
	},
	120_000,
);

/** A customer with 10 monthly messages, and the Atom's hand-ins for it under one fresh journal. */
const initLockHandIn = async ({ customerId }: { customerId: string }) => {
	const free = products.base({
		id: "free",
		items: [items.monthlyMessages({ includedUsage: 10 })],
	});
	const { autumnV2_6 } = await initScenario({
		customerId,
		setup: [
			s.customer({ testClock: false }),
			s.otherCustomers([{ id: `${customerId}-other` }]),
			s.products({ list: [free] }),
		],
		actions: [s.billing.attach({ productId: free.id })],
	});
	const atom = await ensureAtomDeployment({ autumn });
	const tokenHash = atomTokenToHash({ token: atom.token });
	const writerId = `w_${crypto.randomUUID()}`;
	const lockTrack = atomTrack({
		customerId,
		value: 8,
		lock: {
			id: `lck_${crypto.randomUUID()}`,
			lockId: customerId,
			expiresAt: Date.now() + 3_600_000,
			expiryAction: "release",
		},
	});
	const append = async (
		handIns: ({ command: TrackCommand } | { finalize: AtomFinalize })[],
		firstSeq: number,
	) => {
		const reply = await postAsAtom({
			autumn,
			path: ATOM_TRACKS_APPEND_PATH,
			tokenHash,
			body: {
				tracks: handIns.map((handIn, index) => ({
					writerId,
					seq: firstSeq + index,
					...handIn,
				})),
			},
		});
		expect(reply.status).toBe(204);
	};
	const expectSeq = (seq: number) =>
		pollUntilAsserted({
			fetch: async () =>
				(await (
					await postAsAtom({
						autumn,
						path: ATOM_SUBJECT_READ_PATH,
						tokenHash,
						body: { customer_id: customerId, entity_id: null },
					})
				).json()) as AtomSubjectBody,
			assert: (body) => expect(body.atom_seqs?.[writerId]).toBe(seq),
		});
	return { autumnV2_6, lockTrack, append, expectSeq };
};

// A handed-in track only lands through the balance worker's log.
test.skipIf(!isBalanceWorkerRoute())(
	`${chalk.yellowBright("atom-tracks5: a lock's track and its release in one request settle in order, against Autumn's own row")}`,
	async () => {
		const customerId = "atom-tracks5";
		const { lockTrack, append, expectSeq } = await initLockHandIn({
			customerId,
		});

		await append(
			[
				{ command: lockTrack },
				{ finalize: atomFinalizeOf({ customerId, lockId: customerId }) },
			],
			1,
		);

		await expectSeq(2);
		await expectBalanceCorrect({
			customerId,
			featureId: TestFeature.Messages,
			remaining: 10,
		});
	},
	120_000,
);

test.skipIf(!isBalanceWorkerRoute())(
	`${chalk.yellowBright("atom-tracks6: a release of a lock Autumn already settled, or named under another customer, moves nothing and its seq lands")}`,
	async () => {
		const customerId = "atom-tracks6";
		const { autumnV2_6, lockTrack, append, expectSeq } = await initLockHandIn({
			customerId,
		});
		await append([{ command: lockTrack }], 1);
		await expectSeq(1);

		await append(
			[
				{
					finalize: atomFinalizeOf({
						customerId: `${customerId}-other`,
						lockId: customerId,
					}),
				},
			],
			2,
		);
		await expectBalanceCorrect({
			customerId,
			featureId: TestFeature.Messages,
			remaining: 2,
		});

		await autumnV2_6.balances.finalize({
			lock_id: customerId,
			action: "confirm",
			customer_id: customerId,
		});
		await append(
			[{ finalize: atomFinalizeOf({ customerId, lockId: customerId }) }],
			3,
		);

		await expectSeq(3);
		await expectBalanceCorrect({
			customerId,
			featureId: TestFeature.Messages,
			remaining: 2,
		});
	},
	120_000,
);

test.skipIf(!isBalanceWorkerRoute())(
	`${chalk.yellowBright("atom-tracks7: a confirm above the lock that leaves the balance under the threshold fires auto top-up")}`,
	async () => {
		const customerId = "atom-tracks7";
		const oneOff = products.oneOffAddOn({
			id: "atom-topup",
			items: [
				items.oneOffMessages({
					includedUsage: 0,
					billingUnits: 100,
					price: 10,
				}),
			],
		});
		const { autumnV2_1 } = await initScenario({
			customerId,
			setup: [
				s.customer({ paymentMethod: "success" }),
				s.products({ list: [oneOff] }),
			],
			actions: [
				s.attach({
					productId: oneOff.id,
					options: [{ feature_id: TestFeature.Messages, quantity: 100 }],
				}),
			],
		});
		await autumnV2_1.customers.update(customerId, {
			billing_controls: {
				auto_topups: [
					{
						feature_id: TestFeature.Messages,
						enabled: true,
						threshold: 20,
						quantity: 100,
					},
				],
			},
		});
		const atom = await ensureAtomDeployment({ autumn });
		const writerId = `w_${crypto.randomUUID()}`;
		const lockTrack = atomTrack({
			customerId,
			value: 10,
			lock: {
				id: `lck_${crypto.randomUUID()}`,
				lockId: customerId,
				expiresAt: Date.now() + 3_600_000,
				expiryAction: "release",
			},
		});

		const reply = await postAsAtom({
			autumn,
			path: ATOM_TRACKS_APPEND_PATH,
			tokenHash: atomTokenToHash({ token: atom.token }),
			body: {
				tracks: [
					{ writerId, seq: 1, command: lockTrack },
					{
						writerId,
						seq: 2,
						finalize: atomFinalizeOf({
							customerId,
							lockId: customerId,
							finalValue: 85,
						}),
					},
				],
			},
		});

		expect(reply.status).toBe(204);
		// 100 - 85 leaves 15, under the threshold of 20, so one pack of 100 is bought.
		await pollUntilAsserted({
			fetch: () => autumnV2_1.customers.get<ApiCustomerV5>(customerId),
			assert: (customer) =>
				expect(customer.balances[TestFeature.Messages]?.remaining).toBe(115),
			timeoutMs: 30_000,
		});
	},
	120_000,
);
