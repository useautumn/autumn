import { z } from "zod";

const tokenRequestFieldsSchema = z
	.object({
		grant_type: z.string().min(1).optional(),
		refresh_token: z.string().min(1).optional(),
	})
	.passthrough();

const fieldsFromUnknown = (value: unknown): OAuthTokenRequestFields => {
	const parsed = tokenRequestFieldsSchema.safeParse(value);
	if (!parsed.success) {
		return { grantType: null, refreshToken: null };
	}
	return {
		grantType: parsed.data.grant_type ?? null,
		refreshToken: parsed.data.refresh_token ?? null,
	};
};

export type OAuthTokenRequestFields = {
	grantType: string | null;
	refreshToken: string | null;
};

export const getOAuthTokenRequestFields = async (
	request: Request,
): Promise<OAuthTokenRequestFields> => {
	const contentType = request.headers.get("content-type") ?? "";
	const rawBody = await request.text();
	if (!rawBody) {
		return { grantType: null, refreshToken: null };
	}
	const mediaType = contentType.split(";")[0]?.trim().toLowerCase();

	if (mediaType === "application/json") {
		try {
			return fieldsFromUnknown(JSON.parse(rawBody));
		} catch {
			return { grantType: null, refreshToken: null };
		}
	}

	const params = new URLSearchParams(rawBody);
	return fieldsFromUnknown(Object.fromEntries(params));
};

export const getRefreshTokenForConsentLookup = async (request: Request) => {
	const fields = await getOAuthTokenRequestFields(request);
	if (fields.grantType !== "refresh_token") return null;
	return fields.refreshToken;
};
