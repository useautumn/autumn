import type { Autumn } from "@useautumn/sdk";
import type {
	AuthResult,
	BackendResult,
	ResolvedIdentity,
	RouteDefinition,
} from "../types";
import { backendSuccess, isBackendResult, sanitizeBody } from "../utils";
import { transformSdkError } from "./errorTransformer";
import { resolveIdentity } from "./resolveIdentity";

/** Build SDK args by sanitizing body and injecting identity */
const buildSdkArgs = ({
	body,
	identity,
}: {
	body: unknown;
	identity: ResolvedIdentity;
}): Record<string, unknown> => {
	const args = sanitizeBody(body);

	if (identity.customerId) {
		args.customerId = identity.customerId;
	}

	return args;
};

/** Execute a route and return BackendResult */
export const executeRoute = async ({
	autumn,
	route,
	body,
	getCustomer,
}: {
	autumn: Autumn;
	route: RouteDefinition;
	body: unknown;
	getCustomer: () => AuthResult;
}): Promise<BackendResult> => {
	const requireCustomer = route.requireCustomer !== false;

	// 1. Resolve identity (and validate if required)
	const identityResult = await resolveIdentity({
		getCustomer,
		requireCustomer,
	});

	if (identityResult.success === false) {
		return identityResult.error;
	}

	const { identity } = identityResult;

	// 2. If customHandler exists, use it (handles special cases)
	if (route.customHandler) {
		try {
			const result = await route.customHandler({ autumn, identity, body });

			// If customHandler returns BackendResult, use it directly
			if (isBackendResult(result)) {
				return result;
			}

			// Otherwise wrap the SDK response
			return backendSuccess({ body: result });
		} catch (error) {
			console.error(`[Autumn] Custom handler failed: ${route.route}`, error);
			return transformSdkError(error);
		}
	}

	// 3. Build args and call SDK
	const sdkArgs = buildSdkArgs({ body, identity });

	try {
		const result = await route.sdkMethod(autumn, sdkArgs);
		return backendSuccess({ body: result });
	} catch (error) {
		console.error(`[Autumn] SDK call failed: ${route.route}`, error);
		return transformSdkError(error);
	}
};
