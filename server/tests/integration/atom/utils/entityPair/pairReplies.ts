import { expect } from "bun:test";
import type { CheckLockParams } from "@autumn/shared";
import { pollUntilAsserted } from "@tests/utils/genUtils.js";
import defaultCtx from "@tests/utils/testInitUtils/createTestContext.js";
import { checkOnAtom } from "../expectAtomCheckCorrect.js";
import { finalizeOnAtom } from "../finalizeOnAtom.js";
import type { EntityPair } from "./initEntityPair.js";

/** A reply as a client reads it: its status and its JSON body. */
export type PairReply = { status: number; body: unknown };

/** Differ between two customers set up seconds apart, however alike: reset and expiry times, and row ids. */
const TIME_KEYS = new Set(["next_reset_at", "resets_at", "expires_at"]);

const normaliseValue = (key: string, value: unknown): unknown => {
	if (TIME_KEYS.has(key) && typeof value === "number") return "<time>";
	if (key === "id" && typeof value === "string" && value.startsWith("cus_ent"))
		return "<cus_ent>";
	return value;
};

/** The body as if the API's customer had been asked: the Atom customer's id (and so its plans' and locks' ids) renamed. */
export const normalisePairBody = ({
	pair,
	body,
}: {
	pair: EntityPair;
	body: unknown;
}): unknown =>
	JSON.parse(
		JSON.stringify(body).replaceAll(pair.atomCustomerId, pair.apiCustomerId),
		normaliseValue,
	);

/** Equal statuses; a 2xx body equal once normalised, an error by its code. */
export const expectSameReply = ({
	pair,
	api,
	atom,
}: {
	pair: EntityPair;
	api: PairReply;
	atom: PairReply;
}) => {
	expect(atom.status).toBe(api.status);
	if (api.status >= 300) {
		expect((atom.body as { code?: string }).code).toBe(
			(api.body as { code?: string }).code,
		);
		return;
	}
	expect(normalisePairBody({ pair, body: atom.body })).toEqual(
		normalisePairBody({ pair, body: api.body }),
	);
};

const postToApi = async ({
	pair,
	path,
	body,
	idempotencyKey,
}: {
	pair: EntityPair;
	path: string;
	body: unknown;
	idempotencyKey?: string;
}): Promise<PairReply> => {
	const response = await fetch(`${pair.autumn.baseUrl}${path}`, {
		method: "POST",
		headers: {
			...pair.autumn.headers,
			...(idempotencyKey && { "Idempotency-Key": idempotencyKey }),
		},
		body: JSON.stringify(body),
	});
	return { status: response.status, body: await response.json() };
};

/** A lock for `customerId`: lock ids are unique per org, so each customer's carries its own id. */
export type PairLock = Omit<CheckLockParams, "lock_id"> & { name: string };

export const pairLockId = ({
	customerId,
	name,
}: {
	customerId: string;
	name: string;
}) => `${customerId}-${name}`;

const lockFor = ({
	customerId,
	lock,
}: {
	customerId: string;
	lock?: PairLock;
}): CheckLockParams | undefined => {
	if (!lock) return undefined;
	const { name, ...params } = lock;
	return { ...params, lock_id: pairLockId({ customerId, name }) };
};

export type PairCheck = {
	entityId?: string;
	featureId: string;
	requiredBalance?: number;
	sendEvent?: boolean;
	lock?: PairLock;
	idempotencyKey?: string;
};

/** The check the API's customer sends the API. */
export const checkOnApi = ({
	pair,
	check,
	customerId = pair.apiCustomerId,
}: {
	pair: EntityPair;
	check: PairCheck;
	customerId?: string;
}) =>
	postToApi({
		pair,
		path: "/balances.check",
		idempotencyKey: check.idempotencyKey,
		body: {
			customer_id: customerId,
			entity_id: check.entityId,
			feature_id: check.featureId,
			required_balance: check.requiredBalance ?? 1,
			send_event: check.sendEvent,
			lock: lockFor({ customerId, lock: check.lock }),
		},
	});

/** The same check the Atom's customer sends the Atom. */
export const checkOnPairAtom = ({
	pair,
	check,
}: {
	pair: EntityPair;
	check: PairCheck;
}) =>
	checkOnAtom({
		atom: pair.atom,
		secretKey: defaultCtx.orgSecretKey,
		customerId: pair.atomCustomerId,
		entityId: check.entityId,
		featureId: check.featureId,
		requiredBalance: check.requiredBalance ?? 1,
		sendEvent: check.sendEvent,
		lock: lockFor({ customerId: pair.atomCustomerId, lock: check.lock }),
		idempotencyKey: check.idempotencyKey,
	});

/**
 * One step of the scenario on both paths: the API's customer through the API, the Atom's through the Atom. The Atom
 * answers it itself (or forwards it for `forwarded`), with the reply the API gave.
 */
export const checkPair = async ({
	pair,
	forwarded = null,
	...check
}: PairCheck & {
	pair: EntityPair;
	forwarded?: string | null;
}) => {
	const [api, atom] = await Promise.all([
		checkOnApi({ pair, check }),
		checkOnPairAtom({ pair, check }),
	]);
	expect(atom.forwarded).toBe(forwarded);
	expectSameReply({ pair, api, atom });
	return { api, atom };
};

export type PairFinalize = {
	lockName: string;
	action: "release" | "confirm";
	overrideValue?: number;
	idempotencyKey?: string;
};

/** The API's customer finalizes its lock through the API. */
export const finalizeOnApi = ({
	pair,
	finalize,
	customerId = pair.apiCustomerId,
}: {
	pair: EntityPair;
	finalize: PairFinalize;
	customerId?: string;
}) =>
	postToApi({
		pair,
		path: "/balances.finalize",
		idempotencyKey: finalize.idempotencyKey,
		body: {
			customer_id: customerId,
			lock_id: pairLockId({ customerId, name: finalize.lockName }),
			action: finalize.action,
			...(finalize.overrideValue !== undefined && {
				override_value: finalize.overrideValue,
			}),
		},
	});

/** The Atom's customer finalizes its lock through the Atom. */
export const finalizeOnPairAtom = ({
	pair,
	finalize,
}: {
	pair: EntityPair;
	finalize: PairFinalize;
}) =>
	finalizeOnAtom({
		atom: pair.atom,
		customerId: pair.atomCustomerId,
		lockId: pairLockId({
			customerId: pair.atomCustomerId,
			name: finalize.lockName,
		}),
		action: finalize.action,
		overrideValue: finalize.overrideValue,
		idempotencyKey: finalize.idempotencyKey,
	});

/** Both customers finalize their lock, each on its own path, with the same reply; the Atom answers it itself. */
export const finalizePair = async ({
	pair,
	...finalize
}: PairFinalize & { pair: EntityPair }) => {
	const [api, atom] = await Promise.all([
		finalizeOnApi({ pair, finalize }),
		finalizeOnPairAtom({ pair, finalize }),
	]);
	expect(atom.forwarded).toBeNull();
	expectSameReply({ pair, api, atom });
	return { api, atom };
};

/** The Atom's own view of the atom customer, and of each entity, has converged on what the API answers for the API's. */
export const expectAtomViewConverged = async ({
	pair,
	featureId,
	timeoutMs = 60_000,
}: {
	pair: EntityPair;
	featureId: string;
	timeoutMs?: number;
}) => {
	for (const entityId of [undefined, ...pair.entityIds]) {
		const check = { entityId, featureId };
		await pollUntilAsserted({
			fetch: async () => ({
				api: await checkOnApi({ pair, check }),
				atom: await checkOnPairAtom({ pair, check }),
			}),
			assert: ({ api, atom }) => {
				expect(atom.forwarded).toBeNull();
				expectSameReply({ pair, api, atom });
			},
			timeoutMs,
		});
	}
};
