import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { type AppEnv, InternalError } from "@autumn/shared";
import {
	deleteOAuthStateData,
	getOAuthStateData,
	setOAuthStateData,
} from "@/external/redis/actions/oauthStateStore/oauthStateStore.js";

type OAuthState = {
	organization_slug: string;
	env: AppEnv;
	redirect_uri: string;
	master_org_id: string | null;
	code_verifier?: string;
	provider?: "stripe" | "revenuecat";
	revenuecat_project_name?: string;
	migration?: boolean;
};

type OAuthStateReturn = { redirectUri: string; issuedAt: number };

const signOAuthStatePayload = (payload: string) =>
	createHmac("sha256", process.env.ENCRYPTION_PASSWORD!)
		.update(`oauth-state:${payload}`)
		.digest("base64url");

const signOAuthState = ({
	stateKey,
	redirectUri,
}: {
	stateKey: string;
	redirectUri: string;
}) => {
	const payload = Buffer.from(
		JSON.stringify({ r: redirectUri, t: Date.now() }),
	).toString("base64url");
	return `${stateKey}.${payload}.${signOAuthStatePayload(payload)}`;
};

export const readOAuthStateReturn = ({
	state,
}: {
	state: string;
}): OAuthStateReturn | null => {
	const [, payload, signature] = state.split(".");
	if (!payload || !signature) return null;

	const expected = Buffer.from(signOAuthStatePayload(payload));
	const received = Buffer.from(signature);
	const isSigned =
		expected.length === received.length && timingSafeEqual(expected, received);
	if (!isSigned) return null;

	const { r, t } = JSON.parse(Buffer.from(payload, "base64url").toString());
	if (typeof r !== "string" || !r || typeof t !== "number") return null;
	return { redirectUri: r, issuedAt: t };
};

export const generateOAuthState = async ({
	organizationSlug,
	env,
	redirectUri,
	masterOrgId,
	codeVerifier,
	provider,
	revenuecatProjectName,
	migration,
}: {
	organizationSlug: string;
	env: AppEnv;
	redirectUri: string;
	masterOrgId: string | null;
	codeVerifier?: string;
	provider?: "stripe" | "revenuecat";
	revenuecatProjectName?: string;
	migration?: boolean;
}): Promise<string> => {
	const maxAttempts = 3;

	for (let attempt = 1; attempt <= maxAttempts; attempt++) {
		const stateKey = signOAuthState({
			stateKey: randomBytes(32).toString("hex"),
			redirectUri,
		});

		const stateData: OAuthState = {
			organization_slug: organizationSlug,
			env,
			redirect_uri: redirectUri,
			master_org_id: masterOrgId,
			...(codeVerifier ? { code_verifier: codeVerifier } : {}),
			...(provider ? { provider } : {}),
			...(revenuecatProjectName
				? { revenuecat_project_name: revenuecatProjectName }
				: {}),
			...(migration ? { migration: true } : {}),
		};

		const existing = await getOAuthStateData<OAuthState>({ stateKey });
		if (!existing) {
			await setOAuthStateData({ stateKey, data: stateData });
			return stateKey;
		}

		if (attempt < maxAttempts) {
			await new Promise((resolve) => setTimeout(resolve, 50));
		}
	}

	throw new InternalError({
		message:
			"Failed to generate unique OAuth state after 3 attempts. Please try again.",
		code: "oauth_state_generation_failed",
	});
};

export const consumeOAuthState = async ({
	stateKey,
}: {
	stateKey: string;
}): Promise<OAuthState | null> => {
	const stateData = await getOAuthStateData<OAuthState>({ stateKey });

	if (!stateData) {
		return null;
	}

	await deleteOAuthStateData({ stateKey });

	return stateData;
};
