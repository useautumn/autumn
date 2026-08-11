import { getAutumnEnv } from "@autumn/env";
import {
	account,
	ErrCode,
	member,
	organizations,
	RecaseError,
	ssoConnection,
	ssoProvider,
	verification,
} from "@autumn/shared";
import { and, eq } from "drizzle-orm";
import type { DrizzleCli } from "@/db/initDrizzle.js";
import { auth } from "@/utils/auth.js";
import {
	buildSsoVerificationHost,
	getSsoVerificationIdentifier,
	normalizeSsoDomain,
	validateSsoIssuer,
} from "./ssoDomainUtils.js";
import { withTrustedSsoOrigin } from "./ssoTrustedOrigins.js";

export type SsoConnectionStatus =
	| "pending_domain_verification"
	| "validating"
	| "active";

type RequestHeaders = Headers | Record<string, string>;

const authBaseUrl = () => getAutumnEnv().AUTUMN_API_URL;

const clientBaseUrl = () =>
	process.env.CLIENT_URL?.replace(/\/$/, "") ?? "http://localhost:3000";

const withDevelopmentDnsResolver = async <T>(run: () => Promise<T>) => {
	if (process.env.NODE_ENV === "production" || !process.env.SSO_DNS_SERVERS)
		return run();

	const dns = await import("node:dns/promises");
	const previousServers = dns.getServers();
	dns.setServers(
		process.env.SSO_DNS_SERVERS.split(",")
			.map((server) => server.trim())
			.filter(Boolean),
	);
	try {
		return await run();
	} finally {
		dns.setServers(previousServers);
	}
};

const parseResponseBody = async (response: Response) => {
	const text = await response.text();
	if (!text) return null;
	try {
		return JSON.parse(text) as Record<string, unknown>;
	} catch {
		return { message: text };
	}
};

const callBetterAuth = async ({
	path,
	headers,
	body,
}: {
	path: string;
	headers: RequestHeaders;
	body: Record<string, unknown>;
}) => {
	const requestHeaders = new Headers(headers);
	requestHeaders.set("content-type", "application/json");
	if (!requestHeaders.has("origin")) {
		requestHeaders.set("origin", clientBaseUrl());
	}
	requestHeaders.delete("content-length");

	const response = await auth.handler(
		new Request(`${authBaseUrl()}${path}`, {
			method: "POST",
			headers: requestHeaders,
			body: JSON.stringify(body),
		}),
	);
	const data = await parseResponseBody(response.clone());

	if (!response.ok) {
		throw new RecaseError({
			message:
				typeof data?.message === "string"
					? data.message
					: "Unable to update single sign-on",
			code: ErrCode.InvalidRequest,
			statusCode: response.status,
		});
	}

	return { response, data };
};

const providerIdForOrganization = async (organizationId: string) => {
	const digest = await crypto.subtle.digest(
		"SHA-256",
		new TextEncoder().encode(organizationId),
	);
	const hash = Buffer.from(digest).toString("hex").slice(0, 20);
	return `autumn-${hash}`;
};

const getSsoSetup = async (organizationId: string) => {
	const providerId = await providerIdForOrganization(organizationId);
	return {
		callbackUrl: `${authBaseUrl()}/api/auth/sso/callback/${providerId}`,
	};
};

const requireOrganizationAdmin = async ({
	db,
	organizationId,
	userId,
}: {
	db: DrizzleCli;
	organizationId: string;
	userId: string;
}) => {
	const membership = await db.query.member.findFirst({
		where: and(
			eq(member.organizationId, organizationId),
			eq(member.userId, userId),
		),
	});
	if (!membership || !["owner", "admin"].includes(membership.role)) {
		throw new RecaseError({
			message: "Only organization owners and admins can manage SSO",
			code: ErrCode.InsufficientScopes,
			statusCode: 403,
		});
	}
	return membership;
};

const getConnection = async ({
	db,
	organizationId,
}: {
	db: DrizzleCli;
	organizationId: string;
}) => {
	const [record] = await db
		.select({
			connection: ssoConnection,
			provider: ssoProvider,
			organization: {
				name: organizations.name,
				logo: organizations.logo,
			},
		})
		.from(ssoConnection)
		.innerJoin(
			ssoProvider,
			eq(ssoConnection.providerId, ssoProvider.providerId),
		)
		.innerJoin(
			organizations,
			eq(ssoConnection.organizationId, organizations.id),
		)
		.where(eq(ssoConnection.organizationId, organizationId))
		.limit(1);
	return record ?? null;
};

const getVerification = async ({
	db,
	providerId,
	domain,
	token,
}: {
	db: DrizzleCli;
	providerId: string;
	domain: string;
	token: string;
}) => {
	const identifier = getSsoVerificationIdentifier({ providerId });
	const pending = await db.query.verification.findFirst({
		where: eq(verification.identifier, identifier),
	});
	return {
		host: buildSsoVerificationHost({ domain, providerId }),
		value: token,
		expiresAt:
			pending?.expiresAt.toISOString() ??
			new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
	};
};

const serializeConnection = async ({
	db,
	record,
	headers,
	verificationToken,
}: {
	db: DrizzleCli;
	record: NonNullable<Awaited<ReturnType<typeof getConnection>>>;
	headers: RequestHeaders;
	verificationToken?: string;
}) => {
	let parsedConfig: { clientId?: string } = {};
	try {
		parsedConfig = JSON.parse(record.provider.oidcConfig ?? "{}");
	} catch {}

	let verificationDetails = null;
	if (record.connection.status === "pending_domain_verification") {
		let token = verificationToken;
		if (!token) {
			const { data } = await callBetterAuth({
				path: "/api/auth/sso/request-domain-verification",
				headers,
				body: { providerId: record.provider.providerId },
			});
			token =
				typeof data?.domainVerificationToken === "string"
					? data.domainVerificationToken
					: undefined;
		}
		if (!token) {
			throw new RecaseError({
				message: "Unable to create domain verification token",
				code: ErrCode.InternalError,
				statusCode: 500,
			});
		}
		verificationDetails = await getVerification({
			db,
			providerId: record.provider.providerId,
			domain: record.provider.domain,
			token,
		});
	}

	const clientId = parsedConfig.clientId ?? "";
	return {
		providerId: record.provider.providerId,
		domain: record.provider.domain,
		issuer: record.provider.issuer,
		status: record.connection.status,
		callbackUrl: `${authBaseUrl()}/api/auth/sso/callback/${record.provider.providerId}`,
		clientIdLastFour:
			clientId.length <= 4 ? "****" : `****${clientId.slice(-4)}`,
		verification: verificationDetails,
	};
};

export const getOrganizationSso = async ({
	db,
	organizationId,
	userId,
	headers,
}: {
	db: DrizzleCli;
	organizationId: string;
	userId: string;
	headers: RequestHeaders;
}) => {
	await requireOrganizationAdmin({ db, organizationId, userId });
	const record = await getConnection({ db, organizationId });
	return {
		setup: await getSsoSetup(organizationId),
		connection: record
			? await serializeConnection({ db, record, headers })
			: null,
	};
};

export const createOrganizationSso = async ({
	db,
	organizationId,
	userId,
	headers,
	input,
}: {
	db: DrizzleCli;
	organizationId: string;
	userId: string;
	headers: RequestHeaders;
	input: {
		domain: string;
		issuer: string;
		clientId: string;
		clientSecret: string;
	};
}) => {
	await requireOrganizationAdmin({ db, organizationId, userId });
	if (await getConnection({ db, organizationId })) {
		throw new RecaseError({
			message: "This organization already has an SSO connection",
			code: ErrCode.InvalidRequest,
			statusCode: 409,
		});
	}

	const domain = normalizeSsoDomain(input.domain);
	const issuer = validateSsoIssuer({
		issuer: input.issuer,
		isProduction: process.env.NODE_ENV === "production",
	});
	const existingDomain = await db.query.ssoProvider.findFirst({
		where: eq(ssoProvider.domain, domain),
	});
	if (existingDomain) {
		throw new RecaseError({
			message: "This domain is already connected to an organization",
			code: ErrCode.InvalidRequest,
			statusCode: 409,
		});
	}

	const providerId = await providerIdForOrganization(organizationId);
	const { data } = await withTrustedSsoOrigin({
		origin: issuer.origin,
		run: () =>
			callBetterAuth({
				path: "/api/auth/sso/register",
				headers,
				body: {
					providerId,
					issuer: issuer.href.replace(/\/$/, ""),
					domain,
					organizationId,
					oidcConfig: {
						clientId: input.clientId,
						clientSecret: input.clientSecret,
						pkce: true,
						scopes: ["openid", "email", "profile"],
					},
				},
			}),
	});

	try {
		await db.insert(ssoConnection).values({
			id: `sso_conn_${crypto.randomUUID()}`,
			providerId,
			organizationId,
			status: "pending_domain_verification",
		});
	} catch (error) {
		await callBetterAuth({
			path: "/api/auth/sso/delete-provider",
			headers,
			body: { providerId },
		}).catch(() => {});
		throw error;
	}

	const record = await getConnection({ db, organizationId });
	if (!record) {
		throw new RecaseError({
			message: "Unable to create SSO connection",
			code: ErrCode.InternalError,
			statusCode: 500,
		});
	}

	return {
		setup: await getSsoSetup(organizationId),
		connection: await serializeConnection({
			db,
			record,
			headers,
			verificationToken:
				typeof data?.domainVerificationToken === "string"
					? data.domainVerificationToken
					: undefined,
		}),
	};
};

export const verifyOrganizationSsoDomain = async ({
	db,
	organizationId,
	userId,
	headers,
}: {
	db: DrizzleCli;
	organizationId: string;
	userId: string;
	headers: RequestHeaders;
}) => {
	await requireOrganizationAdmin({ db, organizationId, userId });
	const record = await getConnection({ db, organizationId });
	if (!record) {
		throw new RecaseError({
			message: "SSO connection not found",
			code: ErrCode.InvalidRequest,
			statusCode: 404,
		});
	}

	await withDevelopmentDnsResolver(() =>
		callBetterAuth({
			path: "/api/auth/sso/verify-domain",
			headers,
			body: { providerId: record.provider.providerId },
		}),
	);
	await db
		.update(ssoConnection)
		.set({ status: "validating", updatedAt: new Date() })
		.where(eq(ssoConnection.id, record.connection.id));

	const updated = await getConnection({ db, organizationId });
	return {
		setup: await getSsoSetup(organizationId),
		connection: await serializeConnection({
			db,
			record: updated!,
			headers,
		}),
	};
};

export const deleteOrganizationSso = async ({
	db,
	organizationId,
	userId,
	headers,
}: {
	db: DrizzleCli;
	organizationId: string;
	userId: string;
	headers: RequestHeaders;
}) => {
	await requireOrganizationAdmin({ db, organizationId, userId });
	const record = await getConnection({ db, organizationId });
	if (!record) return { success: true };

	await callBetterAuth({
		path: "/api/auth/sso/delete-provider",
		headers,
		body: { providerId: record.provider.providerId },
	});
	return { success: true };
};

export const getOrganizationSsoTestUrl = async ({
	db,
	organizationId,
	userId,
}: {
	db: DrizzleCli;
	organizationId: string;
	userId: string;
}) => {
	await requireOrganizationAdmin({ db, organizationId, userId });
	const record = await getConnection({ db, organizationId });
	if (!record || record.connection.status !== "validating") {
		throw new RecaseError({
			message: "Verify the domain before testing SSO",
			code: ErrCode.InvalidRequest,
			statusCode: 409,
		});
	}
	return {
		url: `${authBaseUrl()}/auth/sso/start?providerId=${encodeURIComponent(record.provider.providerId)}&mode=test`,
	};
};

export const resolveSsoSignIn = async ({
	db,
	email,
	providerId,
}: {
	db: DrizzleCli;
	email?: string;
	providerId?: string;
}) => {
	let record = null;
	if (providerId) {
		const [found] = await db
			.select({ connection: ssoConnection, provider: ssoProvider })
			.from(ssoConnection)
			.innerJoin(
				ssoProvider,
				eq(ssoConnection.providerId, ssoProvider.providerId),
			)
			.where(eq(ssoConnection.providerId, providerId))
			.limit(1);
		record = found ?? null;
	} else if (email) {
		const domain = email.trim().toLowerCase().split("@")[1];
		if (domain) {
			const [found] = await db
				.select({ connection: ssoConnection, provider: ssoProvider })
				.from(ssoConnection)
				.innerJoin(
					ssoProvider,
					eq(ssoConnection.providerId, ssoProvider.providerId),
				)
				.where(eq(ssoProvider.domain, domain))
				.limit(1);
			record = found ?? null;
		}
	}

	if (
		!record ||
		record.connection.status !== "active" ||
		!record.provider.domainVerified
	) {
		return { action: "otp" as const };
	}
	return {
		action: "sso" as const,
		url: `${authBaseUrl()}/auth/sso/start?providerId=${encodeURIComponent(record.provider.providerId)}`,
	};
};

export const canStartSso = async ({
	db,
	providerId,
	mode,
	headers,
}: {
	db: DrizzleCli;
	providerId: string;
	mode?: string;
	headers: Headers;
}) => {
	const [record] = await db
		.select({ connection: ssoConnection, provider: ssoProvider })
		.from(ssoConnection)
		.innerJoin(
			ssoProvider,
			eq(ssoConnection.providerId, ssoProvider.providerId),
		)
		.where(eq(ssoConnection.providerId, providerId))
		.limit(1);
	if (!record?.provider.domainVerified) return null;
	if (record.connection.status === "active") {
		return new URL(record.provider.issuer).origin;
	}
	if (record.connection.status !== "validating" || mode !== "test") return null;

	const session = await auth.api.getSession({ headers });
	if (!session?.user.id) return null;
	await requireOrganizationAdmin({
		db,
		organizationId: record.connection.organizationId,
		userId: session.user.id,
	});
	return new URL(record.provider.issuer).origin;
};

export const completeSsoSignIn = async ({
	db,
	organizationId,
	userId,
	providerId,
}: {
	db: DrizzleCli;
	organizationId: string;
	userId: string;
	providerId: string;
}) => {
	const record = await getConnection({ db, organizationId });
	if (!record || record.provider.providerId !== providerId) {
		throw new RecaseError({
			message: "SSO connection not found",
			code: ErrCode.InvalidRequest,
			statusCode: 404,
		});
	}
	const linkedAccount = await db.query.account.findFirst({
		where: and(eq(account.userId, userId), eq(account.providerId, providerId)),
	});
	const membership = await db.query.member.findFirst({
		where: and(
			eq(member.userId, userId),
			eq(member.organizationId, organizationId),
		),
	});
	if (!linkedAccount || !membership) {
		throw new RecaseError({
			message: "A successful invited SSO login is required",
			code: ErrCode.InvalidAuthHeader,
			statusCode: 403,
		});
	}

	let activated = false;
	if (record.connection.status === "validating") {
		if (!["owner", "admin"].includes(membership.role)) {
			throw new RecaseError({
				message: "Only an owner or admin can activate SSO",
				code: ErrCode.InsufficientScopes,
				statusCode: 403,
			});
		}
		await db
			.update(ssoConnection)
			.set({
				status: "active",
				activatedAt: new Date(),
				updatedAt: new Date(),
			})
			.where(eq(ssoConnection.id, record.connection.id));
		activated = true;
	}

	return {
		hint: {
			providerId,
			organizationName: record.organization.name,
			logo: record.organization.logo,
		},
		activated,
	};
};

export const getSsoCompletionCallbackUrl = ({
	providerId,
}: {
	providerId: string;
}) =>
	`${clientBaseUrl()}/sso/callback?providerId=${encodeURIComponent(providerId)}`;
