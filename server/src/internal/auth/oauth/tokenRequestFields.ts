const getString = (value: unknown) =>
	typeof value === "string" && value.length > 0 ? value : null;

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

	if (contentType.includes("application/json")) {
		try {
			const body = JSON.parse(rawBody) as Record<string, unknown>;
			return {
				grantType: getString(body.grant_type),
				refreshToken: getString(body.refresh_token),
			};
		} catch {
			return { grantType: null, refreshToken: null };
		}
	}

	const params = new URLSearchParams(rawBody);
	return {
		grantType: getString(params.get("grant_type")),
		refreshToken: getString(params.get("refresh_token")),
	};
};

export const getRefreshTokenForConsentLookup = async (request: Request) => {
	const fields = await getOAuthTokenRequestFields(request);
	if (fields.grantType !== "refresh_token") return null;
	return fields.refreshToken;
};
