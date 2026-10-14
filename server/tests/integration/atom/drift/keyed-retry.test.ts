/**
 * A keyed deduction sent to the Atom twice: the Atom holds the caller's key per customer, as the API's middleware does.
 *
 * Contract:
 *  1. a deducting check under an Idempotency-Key, sent again: the second is 409 duplicate_idempotency_key, and the Atom's
 *     view and Autumn's balance hold one deduction once the hand-in lands (seq 1 only);
 *  2. a track under a body idempotency_key, sent again: the same.
 */

import { expect, test } from "bun:test";
import { ErrCode } from "@autumn/shared";
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
import {
	INCLUDED_MESSAGES,
	initMessagesCustomer,
} from "./utils/initMessagesCustomer.js";

const replicaSet = useReplicaSet({ size: 1 });

const DEDUCTED = 10;

const expectOneDeduction = async ({
	atom,
	customerId,
}: {
	atom: Awaited<ReturnType<typeof initMessagesCustomer>>["atom"];
	customerId: string;
}) => {
	await expectAutumnLockState({ customerId, openLockIds: [], atomSeqs: [1] });
	await expectBalanceCorrect({
		customerId,
		featureId: TestFeature.Messages,
		remaining: INCLUDED_MESSAGES - DEDUCTED,
	});
	await expectAtomBalance({
		atom,
		customerId,
		remaining: INCLUDED_MESSAGES - DEDUCTED,
	});
};

test.skipIf(!replicaSetRunsHere)(
	`${chalk.yellowBright("keyed-retry1: a deducting check sent again under its Idempotency-Key is 409 on the Atom, and one deduction lands")}`,
	async () => {
		const customerId = "keyed-retry1";
		const { atom } = await initMessagesCustomer({
			customerId,
			atom: replicaSet,
		});
		const send = () =>
			checkOnAtom({
				atom,
				secretKey: defaultCtx.orgSecretKey,
				customerId,
				featureId: TestFeature.Messages,
				requiredBalance: DEDUCTED,
				sendEvent: true,
				idempotencyKey: `${customerId}-key`,
			});

		const first = await send();
		const again = await send();

		expect(first).toMatchObject({ status: 200, forwarded: null });
		expect(again).toMatchObject({
			status: 409,
			body: { code: ErrCode.DuplicateIdempotencyKey },
		});
		await expectOneDeduction({ atom, customerId });
	},
	120_000,
);

test.skipIf(!replicaSetRunsHere)(
	`${chalk.yellowBright("keyed-retry2: a track sent again under its idempotency_key is 409 on the Atom, and one deduction lands")}`,
	async () => {
		const customerId = "keyed-retry2";
		const { atom } = await initMessagesCustomer({
			customerId,
			atom: replicaSet,
		});
		const send = () =>
			trackOnAtom({
				atom,
				customerId,
				featureId: TestFeature.Messages,
				value: DEDUCTED,
				idempotencyKey: `${customerId}-key`,
			});

		const first = await send();
		const again = await send();

		expect(first).toMatchObject({ status: 202, forwarded: null });
		expect(again).toMatchObject({
			status: 409,
			body: { code: ErrCode.DuplicateIdempotencyKey },
		});
		await expectOneDeduction({ atom, customerId });
	},
	120_000,
);
