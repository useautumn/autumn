import { z } from "zod";
import { TwdError } from "../../../http/apiError.ts";
import type { TwdContext } from "../../../lib/types/twdContext.ts";
import { createSession } from "../repos/sessionsRepo.ts";
import { upsertUser } from "../repos/usersRepo.ts";
import { ALLOWED_DOMAIN, isAllowedEmail } from "./allowedDomain.ts";

const GOOGLE_AUTH_URL = "https://accounts.google.com/o/oauth2/v2/auth";
const GOOGLE_TOKEN_URL = "https://oauth2.googleapis.com/token";
const GOOGLE_ISSUERS = ["https://accounts.google.com", "accounts.google.com"];

const IdTokenClaims = z.object({
	iss: z.string(),
	aud: z.string(),
	exp: z.number(),
	email: z.string(),
	email_verified: z.boolean(),
	hd: z.string().optional(),
	name: z.string().optional(),
	picture: z.string().optional(),
});

const randomToken = () =>
	Buffer.from(crypto.getRandomValues(new Uint8Array(32))).toString("base64url");

const redirectUri = ({ ctx }: { ctx: TwdContext }) =>
	`${ctx.env.TWD_PUBLIC_URL}/auth/google/callback`;

const requireGoogleConfig = ({ ctx }: { ctx: TwdContext }) => {
	const { GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET } = ctx.env;
	if (GOOGLE_CLIENT_ID && GOOGLE_CLIENT_SECRET)
		return { clientId: GOOGLE_CLIENT_ID, clientSecret: GOOGLE_CLIENT_SECRET };
	throw new TwdError({
		status: 503,
		code: "oauth_not_configured",
		message: "Google OAuth is not configured on this twd.",
		next: "Use an API key (Authorization: Bearer twd_…) instead.",
		escalate: "a twd admin must set GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET.",
	});
};

const forbidden = ({ email }: { email: string }) =>
	new TwdError({
		status: 403,
		code: "forbidden_domain",
		message: `${email || "This account"} is not a verified @${ALLOWED_DOMAIN} Google account.`,
		next: `Sign in again with your @${ALLOWED_DOMAIN} Google Workspace account.`,
		escalate: `twd is restricted to @${ALLOWED_DOMAIN}; ask an admin if you should have access.`,
	});

/** Authorization URL plus the state + PKCE verifier the caller must persist. */
export const startGoogleSignIn = async ({ ctx }: { ctx: TwdContext }) => {
	const { clientId } = requireGoogleConfig({ ctx });
	const state = randomToken();
	const verifier = randomToken();
	const challenge = Buffer.from(
		await crypto.subtle.digest("SHA-256", new TextEncoder().encode(verifier)),
	).toString("base64url");
	const url = new URL(GOOGLE_AUTH_URL);
	url.search = new URLSearchParams({
		client_id: clientId,
		redirect_uri: redirectUri({ ctx }),
		response_type: "code",
		scope: "openid email profile",
		state,
		code_challenge: challenge,
		code_challenge_method: "S256",
		hd: ALLOWED_DOMAIN,
		prompt: "select_account",
	}).toString();
	return { url: url.toString(), state, verifier };
};

/** Exchanges the code, enforces verified @useautumn.com, upserts the user, opens a session. */
export const completeGoogleSignIn = async ({
	ctx,
	code,
	verifier,
}: {
	ctx: TwdContext;
	code: string;
	verifier: string;
}) => {
	const { clientId, clientSecret } = requireGoogleConfig({ ctx });
	const tokenRes = await fetch(GOOGLE_TOKEN_URL, {
		method: "POST",
		headers: { "content-type": "application/x-www-form-urlencoded" },
		body: new URLSearchParams({
			code,
			client_id: clientId,
			client_secret: clientSecret,
			redirect_uri: redirectUri({ ctx }),
			grant_type: "authorization_code",
			code_verifier: verifier,
		}),
	});
	const tokenBody = await tokenRes.json().catch(() => ({}));
	const idToken = z.object({ id_token: z.string() }).safeParse(tokenBody);
	if (!tokenRes.ok || !idToken.success) {
		ctx.logger.warn("google token exchange failed", {
			status: tokenRes.status,
		});
		throw new TwdError({
			status: 400,
			code: "oauth_exchange_failed",
			message: `Google rejected the sign-in code (HTTP ${tokenRes.status}).`,
			next: `Start again at ${ctx.env.TWD_PUBLIC_URL}/auth/google.`,
		});
	}

	// Token came straight from Google over TLS, so claim checks suffice (OIDC core §3.1.3.7).
	const payload = idToken.data.id_token.split(".")[1] ?? "";
	const claims = z
		.string()
		.transform((raw, zctx) => {
			try {
				return JSON.parse(raw);
			} catch {
				zctx.addIssue({ code: "custom", message: "id_token is not JSON" });
				return z.NEVER;
			}
		})
		.pipe(IdTokenClaims)
		.safeParse(Buffer.from(payload, "base64url").toString("utf8"));
	if (!claims.success) throw forbidden({ email: "" });
	const { iss, aud, exp, email, email_verified, hd, name, picture } =
		claims.data;
	if (
		!GOOGLE_ISSUERS.includes(iss) ||
		aud !== clientId ||
		exp * 1000 < Date.now()
	)
		throw new TwdError({
			status: 400,
			code: "invalid_id_token",
			message: "Google returned an id_token that failed validation.",
			next: `Start again at ${ctx.env.TWD_PUBLIC_URL}/auth/google.`,
		});
	if (!email_verified || hd !== ALLOWED_DOMAIN || !isAllowedEmail({ email }))
		throw forbidden({ email });

	const user = await upsertUser({
		ctx,
		email: email.toLowerCase(),
		name: name ?? null,
		avatarUrl: picture ?? null,
	});
	const session = await createSession({ ctx, userId: user.id });
	ctx.logger.info("signed in", { userId: user.id, via: "session" });
	return { user, session };
};
