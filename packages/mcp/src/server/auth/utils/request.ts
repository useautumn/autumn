import type * as z from "zod/v4";
import { OAuthHttpError } from "./errors.js";
import {
	environmentSchema,
	type MCPOAuthFlags,
	type OAuthEnvironment,
} from "./schemas.js";

/**
 * Validates a request-derived value against a schema, surfacing a 400 with a
 * caller-supplied message instead of zod's default error shape.
 */
export const parseRequestOption = <T>({
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

/** Resolves the Autumn environment from the request header, then the flag. */
export const getEnvironment = ({
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

/**
 * Extracts a directly-supplied Autumn secret key (no OAuth exchange): a
 * `secret-key` header, an `am_`-prefixed bearer token, or the configured flag
 * when OAuth is disabled.
 */
export const getStaticApiKey = ({
	headers,
	flags,
}: {
	headers: Headers;
	flags: MCPOAuthFlags;
}): string | undefined => {
	const secretKey = headers.get("secret-key");
	if (secretKey) return secretKey;

	const authorization = headers.get("authorization");
	const bearer = authorization?.startsWith("Bearer ")
		? authorization.slice("Bearer ".length)
		: undefined;
	if (bearer?.startsWith("am_")) return bearer;

	return flags["oauth-enabled"] ? undefined : flags["secret-key"];
};
