/**
 * A deducting check the client sent under an Idempotency-Key, and the same deduction granted by an Atom.
 *
 * Contract: the SDK falls back to the API when its Atom is slow, so one deduction can reach Autumn twice. The Atom
 * journals it under the client's raw key K, the claim the API's header middleware makes:
 *  1. the API's check under K, then the Atom's hand-in under K: one deduction, and the hand-in still lands its seq,
 *     so the Atom can clear it from its journal;
 *  2. the Atom's hand-in under K, then the API's check under K: the middleware's 409, and one deduction;
 *  3. without a key, the two are two deductions, as today.
 */

import { afterAll, expect, test } from "bun:test";
import { ATOM_SUBJECT_READ_PATH, ATOM_TRACKS_APPEND_PATH } from "@autumn/byoc";
import type { AtomSubjectBody } from "@autumn/byoc/subjects";
import { ErrCode } from "@autumn/shared";
import { TestFeature } from "@tests/setup/v2Features.js";
import { isBalanceWorkerRoute } from "@tests/utils/balanceWorkerRouteTestUtils.js";
import { items } from "@tests/utils/fixtures/items.js";
import { products } from "@tests/utils/fixtures/products.js";
import { pollUntilAsserted } from "@tests/utils/genUtils.js";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario.js";
import chalk from "chalk";
import type { AutumnInt } from "@/external/autumn/autumnCli.js";
import { atomTokenToHash } from "@/internal/byoc/utils/atomTokenUtils.js";
import { expectBalanceCorrect } from "../utils/expectBalanceCorrect.js";
import { atomTrack, postAsAtom } from "./utils/atomHandIn.js";
import { atomTestClient } from "./utils/atomTestClient.js";
import {
	deleteAtomDeployment,
	ensureAtomDeployment,
} from "./utils/ensureAtomDeployment.js";

const autumn = atomTestClient();

afterAll(async () => {
	await deleteAtomDeployment({ autumn });
});

/** A customer with 100 monthly messages, and its Atom handing in one deduction of 10 as seq 1 of a fresh journal. */
const initHandIn = async ({ customerId }: { customerId: string }) => {
	const free = products.base({
		id: "free",
		items: [items.monthlyMessages({ includedUsage: 100 })],
	});
	const { autumnV2_4 } = await initScenario({
		customerId,
		setup: [s.customer({ testClock: false }), s.products({ list: [free] })],
		actions: [s.billing.attach({ productId: free.id })],
	});
	const atom = await ensureAtomDeployment({ autumn });
	const tokenHash = atomTokenToHash({ token: atom.token });
	const writer = `w_${crypto.randomUUID()}`;
	const handIn = async ({ idempotencyKey }: { idempotencyKey?: string }) => {
		const reply = await postAsAtom({
			autumn,
			path: ATOM_TRACKS_APPEND_PATH,
			tokenHash,
			body: {
				writer,
				tracks: [
					{
						seq: 1,
						command: atomTrack({ customerId, value: 10, idempotencyKey }),
					},
				],
			},
		});
		expect(reply.status).toBe(204);
	};
	/** Settles once the hand-in was decided, whether it deducted or not: its seq is on the subject the Atom reads. */
	const waitForSeq = () =>
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
			assert: (body) => expect(body.atom_seqs?.[writer]).toBe(1),
		});
	return { autumnV2_4, handIn, waitForSeq };
};

const deductingCheck = ({
	client,
	customerId,
	idempotencyKey,
}: {
	client: AutumnInt;
	customerId: string;
	idempotencyKey?: string;
}) =>
	fetch(`${client.baseUrl}/balances.check`, {
		method: "POST",
		headers: {
			...client.headers,
			...(idempotencyKey && { "Idempotency-Key": idempotencyKey }),
		},
		body: JSON.stringify({
			customer_id: customerId,
			feature_id: TestFeature.Messages,
			required_balance: 10,
			send_event: true,
		}),
	});

const expectRemaining = ({
	customerId,
	remaining,
}: {
	customerId: string;
	remaining: number;
}) =>
	expectBalanceCorrect({
		customerId,
		featureId: TestFeature.Messages,
		remaining,
	});

// A handed-in track only lands through the balance worker's log.
test.skipIf(!isBalanceWorkerRoute())(
	`${chalk.yellowBright("atom-check-idem1: the API's check under K, then the Atom's hand-in under K: one deduction, and the hand-in's seq lands")}`,
	async () => {
		const customerId = "atom-check-idem1";
		const key = `idem_${crypto.randomUUID()}`;
		const { autumnV2_4, handIn, waitForSeq } = await initHandIn({
			customerId,
		});

		const checked = await deductingCheck({
			client: autumnV2_4,
			customerId,
			idempotencyKey: key,
		});
		await handIn({ idempotencyKey: key });
		await waitForSeq();

		expect(checked.status).toBe(200);
		await expectRemaining({ customerId, remaining: 90 });
	},
	120_000,
);

test.skipIf(!isBalanceWorkerRoute())(
	`${chalk.yellowBright("atom-check-idem2: the Atom's hand-in under K, then the API's check under K: the middleware's 409, one deduction")}`,
	async () => {
		const customerId = "atom-check-idem2";
		const key = `idem_${crypto.randomUUID()}`;
		const { autumnV2_4, handIn, waitForSeq } = await initHandIn({
			customerId,
		});

		await handIn({ idempotencyKey: key });
		await waitForSeq();
		await expectRemaining({ customerId, remaining: 90 });
		const checked = await deductingCheck({
			client: autumnV2_4,
			customerId,
			idempotencyKey: key,
		});

		expect(checked.status).toBe(409);
		expect(await checked.json()).toMatchObject({
			code: ErrCode.DuplicateIdempotencyKey,
		});
		await expectRemaining({ customerId, remaining: 90 });
	},
	120_000,
);

test.skipIf(!isBalanceWorkerRoute())(
	`${chalk.yellowBright("atom-check-idem3: without a key the API's check and the Atom's hand-in are two deductions")}`,
	async () => {
		const customerId = "atom-check-idem3";
		const { autumnV2_4, handIn, waitForSeq } = await initHandIn({
			customerId,
		});

		const checked = await deductingCheck({ client: autumnV2_4, customerId });
		await handIn({});
		await waitForSeq();

		expect(checked.status).toBe(200);
		await expectRemaining({ customerId, remaining: 80 });
	},
	120_000,
);
