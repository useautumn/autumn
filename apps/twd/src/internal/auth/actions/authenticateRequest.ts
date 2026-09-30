import { parseSigned } from "hono/utils/cookie";
import { TwdError } from "../../../http/apiError.ts";
import { createContext } from "../../../lib/createContext.ts";
import type { Actor } from "../../../lib/types/actor.ts";
import type { TwdContext } from "../../../lib/types/twdContext.ts";
import { findActiveApiKeyByHash, touchApiKey } from "../repos/apiKeysRepo.ts";
import { findLiveSession } from "../repos/sessionsRepo.ts";
import { upsertUser } from "../repos/usersRepo.ts";
import { ALLOWED_DOMAIN, isAllowedEmail } from "./allowedDomain.ts";
import { API_KEY_PREFIX, hashApiKey } from "./apiKeys.ts";

export const SESSION_COOKIE = "twd_session";
const LAST_USED_THROTTLE_MS = 5 * 60 * 1000;

let devActor: Promise<Actor> | undefined;
const getDevActor = ({ ctx, email }: { ctx: TwdContext; email: string }) => {
	if (!isAllowedEmail({ email }))
		throw new TwdError({
			status: 500,
			code: "invalid_dev_auth",
			message: `TWD_DEV_AUTH_EMAIL=${email} is not an @${ALLOWED_DOMAIN} address.`,
			next: `Set TWD_DEV_AUTH_EMAIL to your @${ALLOWED_DOMAIN} email or unset it.`,
		});
	devActor ??= upsertUser({ ctx, email: email.toLowerCase() })
		.then(
			(user): Actor => ({
				userId: user.id,
				email: user.email,
				via: "session",
			}),
		)
		.catch((error) => {
			devActor = undefined;
			throw error;
		});
	return devActor;
};

/** Resolves the caller from `Authorization: Bearer twd_…`, the session cookie, or dev auth. */
export const authenticateRequest = async ({
	request,
}: {
	request: Request;
}): Promise<Actor | null> => {
	const ctx = createContext();

	const bearer = request.headers
		.get("authorization")
		?.match(/^Bearer\s+(\S+)$/i)?.[1];
	if (bearer?.startsWith(API_KEY_PREFIX)) {
		const key = await findActiveApiKeyByHash({
			ctx,
			keyHash: hashApiKey({ secret: bearer }),
		});
		if (!key) return null;
		if (
			!key.lastUsedAt ||
			Date.now() - key.lastUsedAt.getTime() > LAST_USED_THROTTLE_MS
		)
			await touchApiKey({ ctx, id: key.id, throttleMs: LAST_USED_THROTTLE_MS });
		return {
			userId: key.userId,
			email: key.ownerEmail,
			via: `api_key:${key.id}`,
		};
	}

	const cookieHeader = request.headers.get("cookie");
	if (cookieHeader) {
		const sessionId = (
			await parseSigned(
				cookieHeader,
				ctx.env.TWD_SESSION_SECRET,
				SESSION_COOKIE,
			)
		)[SESSION_COOKIE];
		const session = sessionId
			? await findLiveSession({ ctx, sessionId })
			: undefined;
		if (session)
			return { userId: session.userId, email: session.email, via: "session" };
	}

	const devEmail = ctx.env.TWD_DEV_AUTH_EMAIL;
	return devEmail ? getDevActor({ ctx, email: devEmail }) : null;
};
