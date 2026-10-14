import { ApiVersion, LATEST_VERSION } from "@autumn/shared";
import defaultCtx from "@tests/utils/testInitUtils/createTestContext.js";
import type { TestAtom } from "./ensureAtomDeployment.js";

/** A finalize sent to the Atom as an SDK sends it: from 2.6 it names its customer, before that only its lock. */
export const finalizeOnAtom = async ({
	atom,
	customerId,
	lockId,
	action = "release",
	overrideValue,
	apiVersion = LATEST_VERSION,
}: {
	atom: TestAtom;
	customerId: string;
	lockId: string;
	action?: "release" | "confirm";
	overrideValue?: number;
	apiVersion?: ApiVersion;
}): Promise<{ status: number; forwarded: string | null; body: unknown }> => {
	const namesCustomer = apiVersion === ApiVersion.V2_6;
	const response = await fetch(`${atom.endpointUrl}/v1/balances.finalize`, {
		method: "POST",
		headers: {
			"Content-Type": "application/json",
			Authorization: `Bearer ${defaultCtx.orgSecretKey}`,
			"x-api-version": apiVersion,
			"x-atom-token": atom.token,
		},
		body: JSON.stringify({
			...(namesCustomer && { customer_id: customerId }),
			lock_id: lockId,
			action,
			...(overrideValue !== undefined && { override_value: overrideValue }),
		}),
	});
	return {
		status: response.status,
		forwarded: response.headers.get("x-atom-forwarded"),
		body: await response.json(),
	};
};
