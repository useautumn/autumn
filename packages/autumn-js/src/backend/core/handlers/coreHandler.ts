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

	const router = buildRouter({ pathPrefix, routes });

	return async (request: UnifiedRequest): Promise<UnifiedResponse> => {
		const keyCheck = secretKeyCheck(secretKey);
		if (!keyCheck.found) {
			return {
				status: keyCheck.error.statusCode,
				body: keyCheck.error,
			};
		}

		const autumn = new Autumn({
			secretKey: secretKey || process.env.AUTUMN_SECRET_KEY,
			...(autumnURL && { serverURL: autumnURL }),
		});

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

		const { route } = match.data;
		const result = await executeRoute({
			autumn,
			route,
			body: request.body,
			getCustomer: () => identify(request.raw),
		});

		return {
			status: result.statusCode,
			body: result.body,
		};
	};
};
