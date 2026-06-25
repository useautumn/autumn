import { createHash } from "node:crypto";
import { getBearerToken, isOAuthToken, isSecretKeyPrefix } from "@autumn/auth";
import {
	getProtectedResourceMetadataUrl,
	getWwwAuthenticateHeader,
} from "@autumn/auth/oauth";
import {
	type AutumnMcpAuth,
	DEFAULT_API_VERSION,
	environmentSchema,
	type MCPServerFlags,
	type OAuthEnvironment,
} from "@autumn/mcp";
import { DEFAULT_OAUTH_RESOURCE_SCOPES } from "@autumn/shared";
import * as z from "zod/v4";
import { OAuthHttpError } from "./protectedResourceMetadata.js";

type AuthLogger = {
	warning: (message: string, data?: Record<string, unknown>) => void;
};

export interface MCPOAuthFlags extends MCPServerFlags {
	readonly "oauth-enabled"?: boolean | undefined;
	readonly "oauth-environment"?: OAuthEnvironment | undefined;
}

const xApiVersionSchema = z.string().default(DEFAULT_API_VERSION);
const secretKeySchema = z.string().min(1).optional();
const failOpenSchema = z
	.union([
		z.boolean(),
		z.enum(["true", "false"]).transform((v) => v === "true"),
	])
	.default(true);

const parseRequestOption = <T>({
	value,
	schema,
	message,
}: {
	value: unknown;
	schema: z.ZodType<T>;
	message: string;
}): T => {
	const parsed = schema.safeParse(value);
	if (parsed.success) return parsed.data;

	throw new OAuthHttpError(400, message, "invalid_request");
};

const getEnvironment = ({
	headers,
	flags,
}: {
	headers: Headers;
	flags: MCPOAuthFlags;
}): OAuthEnvironment =>
	parseRequestOption({
		value:
			headers.get("x-autumn-environment") ??
			flags["oauth-environment"] ??
			"sandbox",
		schema: environmentSchema,
		message: "Invalid x-autumn-environment",
	});

const getStaticApiKey = ({
	headers,
	flags,
}: {
	headers: Headers;
	flags: MCPOAuthFlags;
}): string | undefined => {
	const secretKey = headers.get("secret-key");
	if (secretKey && isSecretKeyPrefix({ token: secretKey })) return secretKey;

	const bearer = getBearerToken({ headers });
	if (bearer && isSecretKeyPrefix({ token: bearer })) return bearer;

	const fallbackSecretKey = flags["secret-key"];
	if (
		!flags["oauth-enabled"] &&
		fallbackSecretKey &&
		isSecretKeyPrefix({ token: fallbackSecretKey })
	) {
		return fallbackSecretKey;
	}

	return undefined;
};

const principalFromSecret = ({
	kind,
	value,
}: {
	kind: string;
	value: string;
}) => {
	const digest = createHash("sha256").update(value).digest("hex").slice(0, 32);
	return `${kind}:${digest}`;
};

export const buildAuthForRequest = async ({
	headers,
	flags,
	logger,
	resourceUrl,
}: {
	headers: Headers;
	flags: MCPOAuthFlags;
	logger: AuthLogger;
	resourceUrl: string;
}): Promise<AutumnMcpAuth> => {
	const env = getEnvironment({ headers, flags });
	const xApiVersion = parseRequestOption({
		value: headers.get("x-api-version") ?? flags["x-api-version"],
		schema: xApiVersionSchema,
		message: "Invalid x-api-version",
	});
	const failOpen = parseRequestOption({
		value: headers.get("fail-open") ?? flags["fail-open"],
		schema: failOpenSchema,
		message: "Invalid fail-open",
	});
	const apiKey = parseRequestOption({
		value: getStaticApiKey({ headers, flags }),
		schema: secretKeySchema,
		message: "Invalid secret-key",
	});

	if (apiKey) {
		return {
			apiKey,
			authMethod: "secret-key",
			env,
			resource: resourceUrl,
			principalId: principalFromSecret({ kind: "secret-key", value: apiKey }),
			scopes: [...DEFAULT_OAUTH_RESOURCE_SCOPES],
			serverURL: flags["server-url"],
			xApiVersion,
			failOpen,
		};
	}

	const bearer = getBearerToken({ headers });
	if (bearer && isOAuthToken({ token: bearer })) {
		return {
			apiKey: bearer,
			authMethod: "oauth",
			env,
			resource: resourceUrl,
			principalId: "oauth:unverified",
			scopes: [...DEFAULT_OAUTH_RESOURCE_SCOPES],
			serverURL: flags["server-url"],
			xApiVersion,
			failOpen,
		};
	}

	if (bearer) {
		throw new OAuthHttpError(
			401,
			"Invalid OAuth token prefix",
			"invalid_token",
		);
	}

	if (flags["oauth-enabled"]) {
		throw new OAuthHttpError(
			401,
			"Missing Autumn API key bearer token",
			"invalid_token",
			getWwwAuthenticateHeader({
				resourceMetadataUrl: getProtectedResourceMetadataUrl({
					resourceUrl,
				}),
				error: "invalid_token",
			}),
		);
	}

	logger.warning("Missing secret-key for MCP request");
	throw new OAuthHttpError(401, "Missing secret-key", "invalid_token");
};
