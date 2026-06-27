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
import { beforeSessionUpdated } from "./authUtils/beforeSessionUpdated.js";
import { getScopesForUserInOrg } from "./authUtils/customSessionScopes.js";
import { ADMIN_USER_IDs } from "./constants.js";

// emulate.dev Google: rewrite outbound Google OAuth host so agent worktrees
// can use any redirect URI without registering it in the real Google console.
// Real Google's oauth2.googleapis.com/token maps to emulate's /oauth2/token path.
if (process.env.EMULATE_GOOGLE_URL && process.env.NODE_ENV !== "production") {
	const emulate = process.env.EMULATE_GOOGLE_URL.replace(/\/$/, "");
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

const emulateGoogleUrl =
	process.env.NODE_ENV !== "production"
		? process.env.EMULATE_GOOGLE_URL?.replace(/\/$/, "")
		: undefined;

// HTTPS agent worktrees go through portless (e.g. wtN-api.localhost). The
// OAuth flow leaves and returns via a third-party host (emulate.dev), so the
// state cookie must be SameSite=None+Secure to survive the round trip.
const isProductionAuth = process.env.NODE_ENV === "production";
const configuredAuthBaseUrl = process.env.BETTER_AUTH_URL?.trim() || undefined;
const authBaseUrl =
	configuredAuthBaseUrl ?? (isProductionAuth ? undefined : "http://localhost:8080");
const isHttpsBaseUrl = authBaseUrl?.startsWith("https://");

const parseMcpResourceUrl = (rawUrl: string) => {
	const resourceUrl = rawUrl.trim();
	if (!resourceUrl) return null;

	try {
		return new URL(resourceUrl).href;
	} catch {
		console.warn(`Ignoring invalid MCP_RESOURCE_URLS entry: ${resourceUrl}`);
		return null;
	}
};

// Public hosts that serve OAuth-protected MCP endpoints. leaf serves both the
// MCP server (MCP_SERVER_URL) and the chat/slackbot (CHAT_SERVER_URL); the
// autumn server can also proxy /mcp under its own origin (BETTER_AUTH_URL).
// The OAuth `resource` indicator is host-based, so every public host + path
// must be a registered audience. MCP_RESOURCE_URLS is an explicit override.
const mcpServerUrl =
	process.env.MCP_SERVER_URL ??
	(isProductionAuth ? "https://mcp.useautumn.com" : "http://localhost:3099");
const chatServerUrl =
	process.env.CHAT_SERVER_URL ??
	(isProductionAuth ? "https://chat.useautumn.com" : "http://localhost:3099");

const mcpResourcePaths = ["/mcp"];
const mcpResourceBases = [
	authBaseUrl,
	mcpServerUrl,
	chatServerUrl,
].filter((base): base is string => Boolean(base));

const mcpResourceUrls = [
	...new Set([
		...mcpResourceBases.flatMap((base) =>
			mcpResourcePaths.map((path) => new URL(path, base).href),
		),
		...(process.env.MCP_RESOURCE_URLS?.split(",")
			.map(parseMcpResourceUrl)
			.filter((url): url is string => Boolean(url)) ?? []),
	]),
];

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
const passkeyFrontendUrl = process.env.CLIENT_URL ?? "http://localhost:3000";
const passkeyOrigins: string[] = [passkeyFrontendUrl];
const passkeyRpID = (() => {
	try {
		return new URL(passkeyFrontendUrl).hostname;
	} catch {
		return "localhost";
	}
})();

if (
	process.env.VITE_FRONTEND_URL &&
	process.env.VITE_FRONTEND_URL !== passkeyFrontendUrl
) {
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
	baseURL: authBaseUrl,
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
			update: {
				before: beforeSessionUpdated,
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
		if (process.env.CLIENT_URL) origins.push(process.env.CLIENT_URL);
		if (authBaseUrl) origins.push(authBaseUrl);
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
			redirectURI: authBaseUrl
				? `${authBaseUrl}/api/auth/callback/google`
				: undefined,
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
			// Allows /email-otp/request-email-change + /email-otp/change-email.
			// The OAuth `account` row is keyed by (providerId, accountId), not
			// user.email, so updating user.email does NOT break Google sign-in:
			// the account stays linked to the original Google identity. See
			// better-auth/oauth2/link-account.ts → findOAuthUser().
			changeEmail: {
				enabled: true,
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
			validAudiences: [authBaseUrl, ...mcpResourceUrls].filter(
				Boolean,
			) as string[],
			allowDynamicClientRegistration: true,
			allowUnauthenticatedClientRegistration: true,
			customAccessTokenClaims: ({ referenceId }) => ({
				reference_id: referenceId,
			}),
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
