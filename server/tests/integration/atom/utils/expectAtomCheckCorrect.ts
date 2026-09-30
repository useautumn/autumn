import { expect } from "bun:test";
import { pollUntilAsserted } from "@tests/utils/genUtils.js";
import type { TestAtom } from "./ensureAtomDeployment.js";

/** One check sent straight to the Atom, as the org's own app would. A null token sends none. */
export const checkOnAtom = async ({
	atom,
	token = atom.token,
	customerId,
	featureId,
	requiredBalance = 1,
}: {
	atom: TestAtom;
	token?: string | null;
	customerId: string;
	featureId: string;
	requiredBalance?: number;
}): Promise<{ status: number; body: unknown }> => {
	const response = await fetch(`${atom.endpointUrl}/v1/balances.check`, {
		method: "POST",
		headers: {
			"Content-Type": "application/json",
			...(token && { "x-atom-token": token }),
		},
		body: JSON.stringify({
			customer_id: customerId,
			feature_id: featureId,
			required_balance: requiredBalance,
		}),
	});
	return { status: response.status, body: await response.json() };
};

/** Polls: a change reaches the Atom through the worker's log and herald, a moment after the API answers. */
export const expectAtomCheckCorrect = async ({
	atom,
	customerId,
	featureId,
	requiredBalance,
	allowed,
}: {
	atom: TestAtom;
	customerId: string;
	featureId: string;
	requiredBalance: number;
	allowed: boolean;
}): Promise<void> => {
	await pollUntilAsserted({
		fetch: () => checkOnAtom({ atom, customerId, featureId, requiredBalance }),
		assert: ({ body }) => expect(body).toEqual({ allowed }),
	});
};
