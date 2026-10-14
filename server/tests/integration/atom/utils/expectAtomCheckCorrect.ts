import { expect } from "bun:test";
import { type CheckLockParams, LATEST_VERSION } from "@autumn/shared";
import { pollUntilAsserted } from "@tests/utils/genUtils.js";
import type { AutumnInt } from "@/external/autumn/autumnCli.js";
import type { TestAtom } from "./ensureAtomDeployment.js";

/** Set on a reply the Autumn API gave because the Atom did not answer the check itself. */
const FORWARDED_HEADER = "x-atom-forwarded";
/** Set on a reply a starting replica had another replica give. */
const PROXIED_HEADER = "x-atom-proxied";

/** One check sent to the Atom as an SDK on the latest API version sends it. A null token sends none. */
export const checkOnAtom = async ({
	atom,
	token = atom.token,
	secretKey,
	customerId,
	entityId,
	featureId,
	requiredBalance = 1,
	sendEvent,
	lock,
	idempotencyKey,
}: {
	atom: TestAtom;
	token?: string | null;
	secretKey: string;
	customerId: string;
	entityId?: string;
	featureId: string;
	requiredBalance?: number;
	sendEvent?: boolean;
	lock?: CheckLockParams;
	idempotencyKey?: string;
}): Promise<{
	status: number;
	forwarded: string | null;
	proxied: string | null;
	body: unknown;
}> => {
	const response = await fetch(`${atom.endpointUrl}/v1/balances.check`, {
		method: "POST",
		headers: {
			"Content-Type": "application/json",
			Authorization: `Bearer ${secretKey}`,
			"x-api-version": LATEST_VERSION,
			...(token && { "x-atom-token": token }),
			...(idempotencyKey && { "Idempotency-Key": idempotencyKey }),
		},
		body: JSON.stringify({
			customer_id: customerId,
			entity_id: entityId,
			feature_id: featureId,
			required_balance: requiredBalance,
			send_event: sendEvent,
			lock,
		}),
	});
	return {
		status: response.status,
		forwarded: response.headers.get(FORWARDED_HEADER),
		proxied: response.headers.get(PROXIED_HEADER),
		body: await response.json(),
	};
};

/** Polls until the Atom answers the check itself (or forwards it for `forwarded`) with `allowed` when given: a change reaches it through the worker's log and herald, a moment after the API answers.
 * With `api`, the reply must also equal that client's own answer to the same check. A `timeoutMs` of 0 asks once. */
export const expectAtomCheckCorrect = async ({
	atom,
	secretKey,
	customerId,
	entityId,
	featureId,
	requiredBalance,
	allowed,
	forwarded = null,
	api,
	timeoutMs,
}: {
	atom: TestAtom;
	secretKey: string;
	customerId: string;
	entityId?: string;
	featureId: string;
	requiredBalance: number;
	allowed?: boolean;
	forwarded?: string | null;
	api?: AutumnInt;
	timeoutMs?: number;
}): Promise<unknown> => {
	const { atomReply } = await pollUntilAsserted({
		fetch: async () => {
			const [atomReply, apiBody] = await Promise.all([
				checkOnAtom({
					atom,
					secretKey,
					customerId,
					entityId,
					featureId,
					requiredBalance,
				}),
				api?.post("/balances.check", {
					customer_id: customerId,
					entity_id: entityId,
					feature_id: featureId,
					required_balance: requiredBalance,
				}),
			]);
			return { atomReply, apiBody };
		},
		assert: ({ atomReply, apiBody }) => {
			expect(atomReply.forwarded).toBe(forwarded);
			if (allowed !== undefined)
				expect(atomReply.body).toMatchObject({ allowed });
			if (api) expect(atomReply.body).toEqual(apiBody);
		},
		timeoutMs,
	});
	return atomReply.body;
};
