import { expect } from "bun:test";
import { LATEST_VERSION } from "@autumn/shared";
import { pollUntilAsserted } from "@tests/utils/genUtils.js";
import type { AutumnInt } from "@/external/autumn/autumnCli.js";
import type { TestAtom } from "./ensureAtomDeployment.js";

/** Set on a reply the Autumn API gave because the Atom did not answer the check itself. */
const FORWARDED_HEADER = "x-atom-forwarded";

/** One check sent to the Atom as an SDK on the latest API version sends it. A null token sends none. */
export const checkOnAtom = async ({
	atom,
	token = atom.token,
	secretKey,
	customerId,
	entityId,
	featureId,
	requiredBalance = 1,
}: {
	atom: TestAtom;
	token?: string | null;
	secretKey: string;
	customerId: string;
	entityId?: string;
	featureId: string;
	requiredBalance?: number;
}): Promise<{ status: number; forwarded: string | null; body: unknown }> => {
	const response = await fetch(`${atom.endpointUrl}/v1/balances.check`, {
		method: "POST",
		headers: {
			"Content-Type": "application/json",
			Authorization: `Bearer ${secretKey}`,
			"x-api-version": LATEST_VERSION,
			...(token && { "x-atom-token": token }),
		},
		body: JSON.stringify({
			customer_id: customerId,
			entity_id: entityId,
			feature_id: featureId,
			required_balance: requiredBalance,
		}),
	});
	return {
		status: response.status,
		forwarded: response.headers.get(FORWARDED_HEADER),
		body: await response.json(),
	};
};

/** Polls until the Atom answers the check itself (or forwards it for `forwarded`) with `allowed`: a change reaches it through the worker's log and herald, a moment after the API answers.
 * With `api`, the reply must also equal that client's own answer to the same check. */
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
}: {
	atom: TestAtom;
	secretKey: string;
	customerId: string;
	entityId?: string;
	featureId: string;
	requiredBalance: number;
	allowed: boolean;
	forwarded?: string | null;
	api?: AutumnInt;
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
			expect(atomReply.body).toMatchObject({ allowed });
			if (api) expect(atomReply.body).toEqual(apiBody);
		},
	});
	return atomReply.body;
};
