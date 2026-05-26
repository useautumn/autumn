import "dotenv/config";
import { ALL_SCOPES, ac, invitation, roles, schemas } from "@autumn/shared";
import { oauthProvider } from "@better-auth/oauth-provider";
import { passkey } from "@better-auth/passkey";
import { type BetterAuthOptions, betterAuth, type User } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import {
	admin,
	customSession,
	emailOTP,
	jwt,
	type Organization,
	organization,
} from "better-auth/plugins";
import type { AccessControl } from "better-auth/plugins/access";
import { eq } from "drizzle-orm";
import { db } from "@/db/initDrizzle.js";
import { logger } from "@/external/logtail/logtailUtils.js";
import { createLoopsContact } from "@/external/resend/loopsUtils.js";
import { sendInvitationEmail } from "@/internal/emails/sendInvitationEmail.js";
import { sendOnboardingEmail } from "@/internal/emails/sendOnboardingEmail.js";
import sendOTPEmail from "@/internal/emails/sendOTPEmail.js";
import { afterOrgCreated } from "./authUtils/afterOrgCreated.js";
import { afterSessionCreated } from "./authUtils/afterSessionCreated.js";
import { afterSessionDeleted } from "./authUtils/afterSessionDeleted.js";
import { beforeSessionCreated } from "./authUtils/beforeSessionCreated.js";
import { getScopesForUserInOrg } from "./authUtils/customSessionScopes.js";
import { ADMIN_USER_IDs } from "./constants.js";

// Vercel-hosted @emulators/google. Endpoints live under <base>/oauth2/...
// and the OIDC discovery doc lives under <base>/.well-known/openid-configuration,
// matching real Google's path layout exactly. Override per-env via EMULATE_GOOGLE_URL.
const EMULATE_GOOGLE_URL_DEFAULT =
	"https://emulate-vercel.vercel.app/emulate/google";

const emulateGoogleUrl =
	process.env.NODE_ENV !== "production"
		? (process.env.EMULATE_GOOGLE_URL ?? EMULATE_GOOGLE_URL_DEFAULT).replace(/\/$/, "")
		: undefined;

// Rewrite outbound Google OAuth requests so agent worktrees / preview deploys
// can use any redirect URI without registering it in the real Google console.
// - https://oauth2.googleapis.com/token       -> <emulate>/oauth2/token
// - https://www.googleapis.com/oauth2/v2/...  -> <emulate>/oauth2/v2/...
if (emulateGoogleUrl) {
	const emulate = emulateGoogleUrl;
	const originalFetch = globalThis.fetch;
	globalThis.fetch = ((input: any, init?: any) => {
		const url =
			typeof input === "string"
				? input
				: input instanceof URL
					? input.href
					: (input as Request).url;
		if (url.startsWith("https://oauth2.googleapis.com")) {
			return originalFetch(
				url.replace("https://oauth2.googleapis.com", `${emulate}/oauth2`),
				init,
			);
		}
		if (url.startsWith("https://www.googleapis.com/oauth2")) {
			return originalFetch(
				url.replace("https://www.googleapis.com", emulate),
				init,
			);
		}
		return originalFetch(input, init);
	}) as typeof fetch;
}

// HTTPS agent worktrees go through portless (e.g. wtN-api.localhost). The
// OAuth flow leaves and returns via a third-party host (emulate.dev), so the
// state cookie must be SameSite=None+Secure to survive the round trip.
const isHttpsBaseUrl = process.env.BETTER_AUTH_URL?.startsWith("https://");

/**
 * Passkey (WebAuthn) is bound to the FRONTEND origin where the browser calls
 * `navigator.credentials.{create,get}`. Derive rpID/origin from CLIENT_URL so
 * Portless worktrees (e.g. https://wt44.localhost) and production both work
 * without explicit env vars.
 *
 * - rpID: the hostname only (no scheme, no port). Browsers treat `*.localhost`
 *   as a secure context, so passkeys work in dev over Portless TLS.
 * - origin: full URL with scheme. Multiple origins may be supplied for envs
 *   that need to accept both Portless and direct localhost.
 */
const passkeyFrontendUrl =
	process.env.CLIENT_URL ?? "http://localhost:3000";
const passkeyOrigins: string[] = [passkeyFrontendUrl];
const passkeyRpID = (() => {
	try {
		return new URL(passkeyFrontendUrl).hostname;
	} catch {
		return "localhost";
	}
})();

if (process.env.VITE_FRONTEND_URL && process.env.VITE_FRONTEND_URL !== passkeyFrontendUrl) {
	try {
		const viteOrigin = new URL(process.env.VITE_FRONTEND_URL);
		if (viteOrigin.hostname === passkeyRpID) {
			passkeyOrigins.push(process.env.VITE_FRONTEND_URL);
		}
	} catch {
		// Invalid URL, ignore
	}
}

const options = {
	baseURL: process.env.BETTER_AUTH_URL,
	telemetry: {
		enabled: false,
	},
	...(isHttpsBaseUrl && {
		advanced: {
			useSecureCookies: true,
			defaultCookieAttributes: {
				sameSite: "none" as const,
				secure: true,
			},
		},
	}),

	database: drizzleAdapter(db, {
		provider: "pg",
		schema: schemas,
	}),

	user: {
		deleteUser: {
			enabled: true,
			sendDeleteAccountVerification: async ({
				user,
				url,
				token,
			}: {
				user: User;
				url: string;
				token: string;
			}) => {
				console.log("Delete account verification", { user, url, token });
			},
		},
	},
	databaseHooks: {
		user: {
			create: {
				after: async (user) => {
					await createLoopsContact(user);
					await sendOnboardingEmail({
						name: user.name,
						email: user.email,
					});
				},
			},
		},
		session: {
			create: {
				before: beforeSessionCreated,
				after: afterSessionCreated,
			},
			delete: {
				after: afterSessionDeleted,
			},
		},
	},
	trustedOrigins: (request?: Request): string[] => {
		const origins: string[] = [
			"http://localhost:3000",
			"https://app.useautumn.com",
			"https://staging.useautumn.com",
			"https://*.useautumn.com",
		];
		if (process.env.NODE_ENV === "production") return origins;

		// Worktree ports follow worktreeOffset = (N-1)*100; accept any localhost
		// port the running stack might use as origin.
		const origin = request?.headers.get("origin") ?? null;
		if (
			origin &&
			/^https?:\/\/(?:[a-zA-Z0-9-]+\.)*localhost(?::\d+)?$/.test(origin)
		) {
			origins.push(origin);
		}
		// Mirror the dev-only allowlist from corsOrigins.ts so origins served via
		// per-developer tunnels (e.g. agent worktrees) also pass better-auth's
		// own trusted-origin check, not just hono/cors.
		const devSuffixes = (process.env.DEV_EXTRA_CORS_ORIGINS ?? "")
			.split(",")
			.map((s) => s.trim())
			.filter(Boolean);
		for (const sfx of devSuffixes) origins.push(`https://*.${sfx}`);

		if (process.env.CLIENT_URL) origins.push(process.env.CLIENT_URL);
		if (process.env.BETTER_AUTH_URL) origins.push(process.env.BETTER_AUTH_URL);
		return origins;
	},
	emailAndPassword: {
		enabled: true,
		disableSignUp: false,
		requireEmailVerification: true,
		minPasswordLength: 8,
		maxPasswordLength: 128,
		autoSignIn: true,
		resetPasswordTokenExpiresIn: 3600, // 1 hour
	},

	socialProviders: {
		google: {
			clientId: process.env.GOOGLE_CLIENT_ID!,
			clientSecret: process.env.GOOGLE_CLIENT_SECRET,
			redirectURI: `${process.env.BETTER_AUTH_URL}/api/auth/callback/google`,
			...(emulateGoogleUrl
				? {
						// HS256-signed id_tokens from emulate fail real Google's RS256 JWKS check.
						authorizationEndpoint: `${emulateGoogleUrl}/o/oauth2/v2/auth`,
						verifyIdToken: async () => true,
					}
				: {}),
		},
	},
	plugins: [
		emailOTP({
			async sendVerificationOTP({ email, otp, type }) {
				// Implement the sendVerificationOTP method to send the OTP to the user's email address

				await sendOTPEmail({
					email,
					otp,
				});
			},
		}),
		admin({
			adminUserIds: ADMIN_USER_IDs,
			impersonationSessionDuration: 1000 * 60 * 60 * 24, // 1 days
		}),

		jwt(),
		oauthProvider({
			loginPage: `${process.env.CLIENT_URL}/sign-in`,
			consentPage: `${process.env.CLIENT_URL}/consent`,
			// Resource-based scopes with R/W actions (plus legacy CRUDL +
			// meta scopes — see shared/utils/scopeDefinitions.ts).
			scopes: [...ALL_SCOPES],
			clientReference: ({ session }) => {
				return (
					(session?.activeOrganizationId as string | undefined) ?? undefined
				);
			},
			// Use the active organization as the consent reference
			// This makes consent org-scoped, not just user-scoped
			postLogin: {
				// Required: page to redirect to if shouldRedirect returns true
				page: `${process.env.CLIENT_URL}/consent`,
				// Required: whether to show post-login page (we don't need this, so always false)
				shouldRedirect: async () => false,
				// Optional: reference ID for consent (org ID makes consent org-scoped)
				consentReferenceId: ({ session }) => {
					return (
						(session?.activeOrganizationId as string | undefined) ?? undefined
					);
				},
			},
		}),

		passkey({
			rpID: passkeyRpID,
			rpName: "Autumn",
			origin: passkeyOrigins.length === 1 ? passkeyOrigins[0]! : passkeyOrigins,
		}),

		organization({
			ac: ac as AccessControl,
			roles,
			creatorRole: "owner",
			async sendInvitationEmail(data: {
				id: string;
				email: string;
				organization: Organization;
			}) {
				const inviteLink = `${process.env.CLIENT_URL}/accept?id=${data.id}`;
				await sendInvitationEmail({
					email: data.email,
					orgName: (data.organization.name as string) ?? "an organization",
					inviteLink: inviteLink,
				});

				try {
					// Update invite to expire in 7 days
					await db
						.update(invitation)
						.set({
							expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
						})
						.where(eq(invitation.id, data.id));
				} catch (error) {
					logger.error("Error updating invite expiration date:", { error });
				}
			},
			schema: {
				organization: {
					modelName: "organizations",
					fields: {
						createdAt: "createdAt",
					},
				},
			},
			organizationHooks: {
				afterCreateOrganization: async ({
					organization,
					user,
				}: {
					organization: Organization;
					user: User;
				}) => {
					await afterOrgCreated({ org: organization, user });
				},
			},
		}),
	],
} satisfies BetterAuthOptions;

export const auth = betterAuth({
	...options,
	plugins: [
		...options.plugins,
		/**
		 * Attach `role` and `scopes` to every session response.
		 *
		 * Must be last in the plugin list so it can observe the session
		 * produced by the other plugins (notably `organization`, which
		 * populates `session.activeOrganizationId`).
		 *
		 * better-auth docs note that custom session fields are NOT cached
		 * (neither in secondary storage nor the cookie cache), so every
		 * `getSession` call pays a DB round-trip. Accepted.
		 */
		customSession(async ({ user, session }) => {
			let role: string | null = null;
			let scopes: string[] = [];
			const orgId = session.activeOrganizationId;
			if (orgId && user?.id) {
				const resolved = await getScopesForUserInOrg({
					db,
					userId: user.id,
					organizationId: orgId,
				});
				role = resolved.role;
				scopes = [...resolved.scopes];
			}

			/**
			 * Inject `superuser` for Autumn staff. Triggered when the
			 * better-auth GLOBAL user role is "admin" (NOT the org role),
			 * or when the session is an impersonation. Mirrors the
			 * client-side check in `useAdmin` and `adminAuthMiddleware`.
			 */
			const globalUserRole = (user as { role?: string } | null | undefined)
				?.role;
			const impersonatedBy = (
				session as { impersonatedBy?: string | null } | null | undefined
			)?.impersonatedBy;
			if (globalUserRole === "admin" || impersonatedBy) {
				if (!scopes.includes("superuser")) scopes.push("superuser");
			}

			return { user, session, role, scopes };
		}, options),
	],
});
