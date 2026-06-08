import {
	getDefaultOAuthScopes,
	isKnownMcpOAuthClientId,
	isMcpOAuthClientRecord,
	isMcpOAuthResource,
} from "@autumn/auth/oauth";
import { ErrCode, isScopeSubset, RecaseError } from "@autumn/shared";
import type { DrizzleCli } from "@/db/initDrizzle.js";
import type { AutumnContext } from "@/honoUtils/HonoEnv.js";
import { getScopesForUserInOrg } from "@/utils/authUtils/customSessionScopes.js";
import { oauthClientRepo } from "../repos/index.js";

export const isMcpOAuthClient = async ({
	clientId,
	db,
	resource,
}: {
	clientId: string;
	db: DrizzleCli;
	resource?: string;
}) => {
	if (isMcpOAuthResource(resource)) return true;
	if (isKnownMcpOAuthClientId({ clientId })) return true;

	const client = await oauthClientRepo.getByClientId({ db, clientId });
	if (!client) return false;

	return isMcpOAuthClientRecord(client);
};

export const isMcpOAuthClientId = async ({
	clientId,
	ctx,
}: {
	clientId: string;
	ctx: AutumnContext;
}) =>
	isMcpOAuthClient({
		clientId,
		db: ctx.db,
		resource: ctx.oauthResource,
	});

export const getMcpOAuthScopeGrant = async ({
	clientId,
	ctx,
	requestedScopes,
}: {
	clientId: string;
	ctx: AutumnContext;
	requestedScopes?: string[] | null;
}) => {
	if (!(await isMcpOAuthClientId({ ctx, clientId }))) return null;

	const orgId = ctx.org?.id;
	if (!ctx.userId || !orgId) {
		throw new RecaseError({
			message: "MCP OAuth scope grant is missing user or organization context",
			code: ErrCode.InvalidRequest,
			statusCode: 400,
		});
	}
	const leafScopes = getDefaultOAuthScopes(requestedScopes);
	const { scopes: userScopes } = await getScopesForUserInOrg({
		db: ctx.db,
		userId: ctx.userId,
		organizationId: orgId,
	});

	return leafScopes.filter((scope) => isScopeSubset([scope], userScopes));
};

export const assertMcpOAuthScopeGrant = async ({
	clientId,
	ctx,
	requestedScopes,
}: {
	clientId: string;
	ctx: AutumnContext;
	requestedScopes?: string[] | null;
}) => {
	const scopes = await getMcpOAuthScopeGrant({
		clientId,
		ctx,
		requestedScopes,
	});
	if (!scopes) return null;
	if (scopes.length > 0) return scopes;

	throw new RecaseError({
		message: "No requested scopes can be granted to this MCP client",
		code: ErrCode.InsufficientScopes,
		statusCode: 403,
	});
};
