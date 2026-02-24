import type { AuthResult, BackendResult, ResolvedIdentity } from "../types";
import { backendError } from "../utils/backendRes";
import { transformSdkError } from "./errorTransformer";

/** Result of identity resolution */
export type IdentityResult =
	| { success: true; identity: ResolvedIdentity }
	| { success: false; error: BackendResult };

/** Resolve identity from the getCustomer function and optionally validate */
export const resolveIdentity = async ({
	getCustomer,
	requireCustomer = true,
}: {
	getCustomer: () => AuthResult;
	requireCustomer?: boolean;
}): Promise<IdentityResult> => {
	try {
		const authResult = await getCustomer();

		const identity: ResolvedIdentity = authResult
			? {
					customerId: authResult.customerId ?? null,
					customerData: authResult.customerData,
				}
			: { customerId: null, customerData: undefined };

		// Validate customer requirement
		if (requireCustomer && !identity.customerId) {
			return {
				success: false,
				error: backendError({
					message: `customerId returned from identify function is ${identity.customerId}`,
					code: "no_customer_id",
					statusCode: 401,
				}),
			};
		}

		return { success: true, identity };
	} catch (error) {
		console.error("[Autumn]: identify failed", error);
		return { success: false, error: transformSdkError(error) };
	}
};
