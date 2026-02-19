import { getSessionFromCtx } from "better-auth/api";

import { handleRouteByName } from "../../backend/core/handlers/handleRouteByName";
import type { RouteName } from "../../backend/core/types";
import type {
	BetterAuthOrganization,
	BetterAuthSession,
	CustomerScope,
	IdentifyFn,
} from "../types";
import type { HandleBetterAuthRouteFn } from "./createAutumnEndpoint";
import { getActiveOrganization } from "./getActiveOrganization";
import { resolveIdentityFromScope } from "./resolveIdentityFromScope";

/** Options for creating a better-auth route handler */
export type CreateHandleBetterAuthRouteOptions = {
	secretKey?: string;
	baseURL?: string;
	customerScope: CustomerScope;
	identify?: IdentifyFn;
};

/** Creates an identity resolver for a given session/org context */
const createIdentityResolver = ({
	session,
	organization,
	customerScope,
	identify,
}: {
	session: BetterAuthSession | null;
	organization: BetterAuthOrganization | null;
	customerScope: CustomerScope;
	identify?: IdentifyFn;
}) => {
	return () => {
		if (identify) {
			return identify({ session, organization });
		}
		return resolveIdentityFromScope({ session, organization, customerScope });
	};
};

/** Creates a route handler function for better-auth endpoints */
export const createHandleBetterAuthRoute = ({
	secretKey,
	baseURL,
	customerScope,
	identify,
}: CreateHandleBetterAuthRouteOptions): HandleBetterAuthRouteFn => {
	return async ({ ctx, routeName }) => {
		const session = (await getSessionFromCtx(
			ctx as Parameters<typeof getSessionFromCtx>[0],
		)) as BetterAuthSession | null;
		const organization = await getActiveOrganization(ctx, session);

		const typedCtx = ctx as { body?: unknown };

		return handleRouteByName({
			routeName,
			body: typedCtx.body,
			identify: createIdentityResolver({
				session,
				organization,
				customerScope,
				identify,
			}),
			secretKey,
			autumnURL: baseURL,
		});
	};
};
