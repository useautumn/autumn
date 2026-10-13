/**
 * A deducting check the client sent under an Idempotency-Key, and the same deduction granted by an Atom first.
 *
 * Contract: the SDK falls back to the API when its Atom is slow, so one deduction can reach Autumn twice. With
 * Idempotency-Key K both claim `track:K`, as a track with body key K does:
 *  1. the API's check, then the Atom's hand-in under K: one deduction;
 *  2. the Atom's hand-in under K, then the API's check: one deduction, and the API answers 409 duplicate;
 *  3. without a header, the API claims nothing: the two are two deductions, as today.
 */

import { afterAll, expect, test } from "bun:test";
import { ATOM_TRACKS_APPEND_PATH } from "@autumn/byoc";
import { ErrCode } from "@autumn/shared";
import { TestFeature } from "@tests/setup/v2Features.js";
import { isBalanceWorkerRoute } from "@tests/utils/balanceWorkerRouteTestUtils.js";
import { items } from "@tests/utils/fixtures/items.js";
import { products } from "@tests/utils/fixtures/products.js";
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

/** A customer with 100 monthly messages, and the handle to hand its Atom's deductions in. */
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
	/** Hands in `tracks`, then a 1-message track: one customer's commands apply in order, so it landing means they were decided. */
	const handIn = async ({
		tracks,
	}: {
		tracks: ReturnType<typeof atomTrack>[];
	}) => {
		const reply = await postAsAtom({
			autumn,
			path: ATOM_TRACKS_APPEND_PATH,
			tokenHash,
			body: {
				writer: `w_${crypto.randomUUID()}`,
				tracks: [...tracks, atomTrack({ customerId, value: 1 })].map(
					(command, index) => ({ seq: index + 1, command }),
				),
			},
		});
		expect(reply.status).toBe(204);
	};
	return { autumnV2_4, handIn };
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

// A handed-in track only lands through the balance worker's log.
test.skipIf(!isBalanceWorkerRoute())(
	`${chalk.yellowBright("atom-check-idem1: the API's check under K, then the Atom's hand-in under K: one deduction")}`,
	async () => {
		const customerId = "atom-check-idem1";
		const key = `idem_${crypto.randomUUID()}`;
		const { autumnV2_4, handIn } = await initHandIn({ customerId });

		const checked = await deductingCheck({
			client: autumnV2_4,
			customerId,
			idempotencyKey: key,
		});
		await handIn({
			tracks: [atomTrack({ customerId, value: 10, idempotencyKey: key })],
		});

		expect(checked.status).toBe(200);
		await expectBalanceCorrect({
			customerId,
			featureId: TestFeature.Messages,
			remaining: 89,
		});
	},
	120_000,
);

test.skipIf(!isBalanceWorkerRoute())(
	`${chalk.yellowBright("atom-check-idem2: the Atom's hand-in under K, then the API's check under K: one deduction, the check 409s")}`,
	async () => {
		const customerId = "atom-check-idem2";
		const key = `idem_${crypto.randomUUID()}`;
		const { autumnV2_4, handIn } = await initHandIn({ customerId });

		await handIn({
			tracks: [atomTrack({ customerId, value: 10, idempotencyKey: key })],
		});
		await expectBalanceCorrect({
			customerId,
			featureId: TestFeature.Messages,
			remaining: 89,
		});
		const checked = await deductingCheck({
			client: autumnV2_4,
			customerId,
			idempotencyKey: key,
		});

		expect(checked.status).toBe(409);
		expect(await checked.json()).toMatchObject({
			code: ErrCode.DuplicateIdempotencyKey,
		});
		await expectBalanceCorrect({
			customerId,
			featureId: TestFeature.Messages,
			remaining: 89,
		});
	},
	120_000,
);

test.skipIf(!isBalanceWorkerRoute())(
	`${chalk.yellowBright("atom-check-idem3: without an Idempotency-Key the API's check and the Atom's hand-in are two deductions")}`,
	async () => {
		const customerId = "atom-check-idem3";
		const { autumnV2_4, handIn } = await initHandIn({ customerId });

		const checked = await deductingCheck({ client: autumnV2_4, customerId });
		await handIn({ tracks: [atomTrack({ customerId, value: 10 })] });

		expect(checked.status).toBe(200);
		await expectBalanceCorrect({
			customerId,
			featureId: TestFeature.Messages,
			remaining: 79,
		});
	},
	120_000,
);
