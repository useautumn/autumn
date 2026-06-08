import {
	ErrCode,
	isValidScope,
	RecaseError,
	type ScopeString,
} from "@autumn/shared";
import { z } from "zod/v4";

export type OAuthApiKeyRequestBody = {
	resource?: unknown;
	scopes?: unknown;
};

export type ResourceAccessTokenRecord = {
	userId: string | null;
	referenceId: string | null;
	clientId: string;
	scopes: string[];
};

const ScopeStringSchema = z.custom<ScopeString>(
	(scope) => typeof scope === "string" && isValidScope(scope),
	{ message: "Invalid scope" },
);
const RequestedScopesSchema = z.array(ScopeStringSchema).optional();
export const OAuthApiKeyRequestBodySchema = z
	.object({
		resource: z.unknown().optional(),
		scopes: z.unknown().optional(),
	})
	.strict();

export const parseRequestedScopes = (scopes: unknown) => {
	const parsed = RequestedScopesSchema.safeParse(scopes);
	if (parsed.success) return parsed.data ?? null;

	throw new RecaseError({
		message: "Invalid scopes",
		code: ErrCode.InvalidRequest,
		statusCode: 400,
	});
};

const getStringClaim = (payload: Record<string, unknown>, key: string) =>
	typeof payload[key] === "string" ? payload[key] : null;

export const tokenRecordFromResourceToken = (
	payload: Record<string, unknown>,
): ResourceAccessTokenRecord => {
	const scope = getStringClaim(payload, "scope");

	return {
		userId: getStringClaim(payload, "sub"),
		referenceId: getStringClaim(payload, "reference_id"),
		clientId:
			getStringClaim(payload, "azp") ??
			getStringClaim(payload, "client_id") ??
			"",
		scopes: scope ? scope.split(" ") : [],
	};
};
