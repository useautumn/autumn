import { Autumn } from "@useautumn/sdk";
import { findRoute } from "rou3";
import { buildRouter, routeConfigs } from "../routes";
import type {
	CoreHandlerOptions,
	UnifiedRequest,
	UnifiedResponse,
} from "../types";
import { secretKeyCheck } from "../utils/secretKeyCheck";
import { executeRoute } from "./executeRoute";

/** Default path prefix for routes */
const DEFAULT_PATH_PREFIX = "/api/autumn";

/** Create the core handler that processes all requests */
export const createCoreHandler = (options: CoreHandlerOptions) => {
	const {
		identify,
		secretKey,
		autumnURL,
		pathPrefix = DEFAULT_PATH_PREFIX,
		routes = routeConfigs,
	} = options;

	// Build router from route definitions
	const router = buildRouter({ pathPrefix, routes });

	return async (request: UnifiedRequest): Promise<UnifiedResponse> => {
		// 1. Secret key check
		const keyCheck = secretKeyCheck(secretKey);
		if (!keyCheck.found) {
			return {
				status: keyCheck.error.statusCode,
				body: keyCheck.error,
			};
		}

		// 2. Create SDK instance
		const autumn = new Autumn({
			secretKey: secretKey || process.env.AUTUMN_SECRET_KEY,
			...(autumnURL && { serverURL: autumnURL }),
		});

		// 3. Match route
		const match = findRoute(router, request.method, request.path);

		if (!match) {
			return {
				status: 404,
				body: {
					message: "Not found",
					code: "not_found",
					statusCode: 404,
				},
			};
		}

		// 4. Execute route
		const { route } = match.data;
		const result = await executeRoute({
			autumn,
			route,
			body: request.body,
			getCustomer: () => identify(request.raw),
		});

		// 5. Return unified response
		return {
			status: result.statusCode,
			body: result.body,
		};
	};
};
