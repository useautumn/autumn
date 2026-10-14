import { Autumn } from "@useautumn/sdk";
import { routeConfigs } from "../routes/routeConfigs";
import type { AuthResult } from "../types";
import { secretKeyCheck } from "../utils/secretKeyCheck";
import { executeRoute } from "./executeRoute";

export type HandleRouteByNameOptions = {
	/** Route name to execute (e.g. "customers.get_or_create") */
	routeName: string;
	/** Request body */
	body: unknown;
	/** Function to identify the customer */
	identify: () => AuthResult;
	/** Autumn API secret key */
	secretKey?: string;
	/** Autumn API URL */
	autumnURL?: string;
};

export type HandleRouteByNameResult = {
	status: number;
	body: unknown;
};

/** Handle a route by name (used by Better Auth plugin) */
export const handleRouteByName = async ({
	routeName,
	body,
	identify,
	secretKey,
	autumnURL,
}: HandleRouteByNameOptions): Promise<HandleRouteByNameResult> => {
	const keyCheck = secretKeyCheck(secretKey);
	if (!keyCheck.found) {
		return {
			status: keyCheck.error.statusCode,
			body: keyCheck.error,
		};
	}

	const route = routeConfigs.find((r) => r.route === routeName);
	if (!route) {
		return {
			status: 404,
			body: { message: "Route not found", code: "route_not_found" },
		};
	}

	const autumn = new Autumn({
		secretKey: secretKey || process.env.AUTUMN_SECRET_KEY,
		...(autumnURL && { serverURL: autumnURL }),
	});

	const result = await executeRoute({
		autumn,
		route,
		body,
		getCustomer: identify,
	});

	return {
		status: result.statusCode,
		body: result.body,
	};
};
