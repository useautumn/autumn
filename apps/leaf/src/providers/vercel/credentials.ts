// `inferScope` is a supported @vercel/sandbox export subpath; it derives the
// team + project from an access token so we don't require VERCEL_PROJECT_ID.
import { inferScope } from "@vercel/sandbox/dist/auth/index.js";
import { env as chatEnv } from "../../lib/env.js";

type Credentials = { projectId: string; teamId: string; token: string };

let cached: Promise<Credentials | Record<string, never>> | undefined;

const resolve = async (): Promise<Credentials | Record<string, never>> => {
	const token = chatEnv.VERCEL_TOKEN;
	if (!token) {
		// Fall through to the ambient OIDC token only if it's actually present;
		// otherwise fail loudly instead of the SDK's opaque LocalOidcContextError.
		if (!process.env.VERCEL_OIDC_TOKEN) {
			throw new Error(
				"Vercel sandbox auth missing: set VERCEL_TOKEN (e.g. in server/.env.local) or pull a VERCEL_OIDC_TOKEN via `vercel env pull`.",
			);
		}
		return {};
	}
	if (chatEnv.VERCEL_PROJECT_ID && chatEnv.VERCEL_TEAM_ID) {
		return {
			projectId: chatEnv.VERCEL_PROJECT_ID,
			teamId: chatEnv.VERCEL_TEAM_ID,
			token,
		};
	}
	const scope = await inferScope({ teamId: chatEnv.VERCEL_TEAM_ID, token });
	return { projectId: scope.projectId, teamId: scope.teamId, token };
};

// Cached: the scope lookup is one network call, stable for the process lifetime.
export const vercelCredentials = () => {
	cached ??= resolve();
	return cached;
};
