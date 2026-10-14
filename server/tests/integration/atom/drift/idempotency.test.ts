/**
 * One track under one idempotency_key, reaching Autumn once through the Atom and once through the API, as an SDK that
 * falls back from a slow Atom sends it.
 *
 * Contract: a body idempotency_key deducts once across both paths, and the Atom's view agrees with Autumn once pushed:
 *  1. the Atom first, then the API: the API's track is the duplicate (409) and moves nothing;
 *  2. the API first, then the Atom: the Atom's hand-in is the duplicate, lands only its seq, and one usage event exists;
 *  3. the same key sent to the Atom twice: Autumn deducts once, and the Atom answers checks from that one deduction
 *     even before the push shows it.
 */

import { expect, test } from "bun:test";
import { ErrCode } from "@autumn/shared";
import { expectCustomerEventsCorrect } from "@tests/integration/balances/utils/events/expectCustomerEventsCorrect.js";
import { TestFeature } from "@tests/setup/v2Features.js";
import defaultCtx from "@tests/utils/testInitUtils/createTestContext.js";
import chalk from "chalk";
import { expectBalanceCorrect } from "../../utils/expectBalanceCorrect.js";
import { expectAutumnLockState } from "../utils/autumnLockState.js";
import { expectAtomBalance } from "../utils/expectAtomBalance.js";
import { checkOnAtom } from "../utils/expectAtomCheckCorrect.js";
import {
	replicaSetRunsHere,
	useReplicaSet,
} from "../utils/replicaSet/useReplicaSet.js";
import { trackOnAtom } from "../utils/trackOnAtom.js";
import { initMessagesCustomer } from "./utils/initMessagesCustomer.js";

const replicaSet = useReplicaSet({ size: 1 });

const TRACKED = 30;

const expectDeductedOnce = async ({
	customerId,
	atomSeqs,
}: {
	customerId: string;
	atomSeqs: number[];
}) => {
	await expectAutumnLockState({ customerId, atomSeqs });
	await expectBalanceCorrect({
		customerId,
		featureId: TestFeature.Messages,
		remaining: 100 - TRACKED,
	});
	await expectAtomBalance({
		atom: replicaSet(),
		customerId,
		remaining: 100 - TRACKED,
	});
	await expectCustomerEventsCorrect({
		customerId,
		events: [{ value: TRACKED }],
	});
};

test.skipIf(!replicaSetRunsHere)(
	`${chalk.yellowBright("idempotency1: a key the Atom handed in is the API's duplicate")}`,
	async () => {
		const customerId = "idempotency1";
		const idempotencyKey = `${customerId}-key`;
		const { atom, autumnV2_6 } = await initMessagesCustomer({
			customerId,
			atom: replicaSet,
		});

		const onAtom = await trackOnAtom({
			atom,
			customerId,
			featureId: TestFeature.Messages,
			value: TRACKED,
			idempotencyKey,
		});
		expect(onAtom).toMatchObject({ status: 202, forwarded: null });
		await expectAutumnLockState({ customerId, atomSeqs: [1] });
		const onApi = await autumnV2_6
			.track({
				customer_id: customerId,
				feature_id: TestFeature.Messages,
				value: TRACKED,
				idempotency_key: idempotencyKey,
			})
			.then(
				() => null,
				(error: { code?: string }) => error.code,
			);

		expect(onApi).toBe(ErrCode.DuplicateIdempotencyKey);
		await expectDeductedOnce({ customerId, atomSeqs: [1] });
	},
	120_000,
);

test.skipIf(!replicaSetRunsHere)(
	`${chalk.yellowBright("idempotency2: a key the API applied is the Atom's duplicate; its seq still lands")}`,
	async () => {
		const customerId = "idempotency2";
		const idempotencyKey = `${customerId}-key`;
		const { atom, autumnV2_6 } = await initMessagesCustomer({
			customerId,
			atom: replicaSet,
		});
		await autumnV2_6.track({
			customer_id: customerId,
			feature_id: TestFeature.Messages,
			value: TRACKED,
			idempotency_key: idempotencyKey,
			async: false,
		});
		await expectAtomBalance({ atom, customerId, remaining: 100 - TRACKED });

		const onAtom = await trackOnAtom({
			atom,
			customerId,
			featureId: TestFeature.Messages,
			value: TRACKED,
			idempotencyKey,
		});

		expect(onAtom).toMatchObject({ status: 202, forwarded: null });
		await expectDeductedOnce({ customerId, atomSeqs: [1] });
	},
	120_000,
);

test.skipIf(!replicaSetRunsHere)(
	`${chalk.yellowBright("idempotency3: a key sent to the Atom twice deducts once, and the Atom's checks agree before the push")}`,
	async () => {
		const customerId = "idempotency3";
		const idempotencyKey = `${customerId}-key`;
		const { atom } = await initMessagesCustomer({
			customerId,
			atom: replicaSet,
		});

		replicaSet().holdPushes();
		const sendTrack = () =>
			trackOnAtom({
				atom,
				customerId,
				featureId: TestFeature.Messages,
				value: TRACKED,
				idempotencyKey,
			});
		await sendTrack();
		await sendTrack();
		const fitsOneDeduction = await checkOnAtom({
			atom,
			secretKey: defaultCtx.orgSecretKey,
			customerId,
			featureId: TestFeature.Messages,
			requiredBalance: 100 - TRACKED,
		});
		await replicaSet().releasePushes();

		expect(fitsOneDeduction.body).toMatchObject({ allowed: true });
		await expectDeductedOnce({ customerId, atomSeqs: [2] });
	},
	120_000,
);
