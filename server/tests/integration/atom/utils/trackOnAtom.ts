import { LATEST_VERSION } from "@autumn/shared";
import defaultCtx from "@tests/utils/testInitUtils/createTestContext.js";
import type { TestAtom } from "./ensureAtomDeployment.js";

/** A track sent to the Atom as an SDK on the latest API version sends it. */
export const trackOnAtom = async ({
	atom,
	customerId,
	featureId,
	value,
	idempotencyKey,
}: {
	atom: TestAtom;
	customerId: string;
	featureId: string;
	value: number;
	idempotencyKey?: string;
}): Promise<{ status: number; forwarded: string | null; body: unknown }> => {
	const response = await fetch(`${atom.endpointUrl}/v1/track`, {
		method: "POST",
		headers: {
			"Content-Type": "application/json",
			Authorization: `Bearer ${defaultCtx.orgSecretKey}`,
			"x-api-version": LATEST_VERSION,
			"x-atom-token": atom.token,
		},
		body: JSON.stringify({
			customer_id: customerId,
			feature_id: featureId,
			value,
			...(idempotencyKey && { idempotency_key: idempotencyKey }),
		}),
	});
	return {
		status: response.status,
		forwarded: response.headers.get("x-atom-forwarded"),
		body: await response.json(),
	};
};
