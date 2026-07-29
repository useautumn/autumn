import type { AppEnv } from "@autumn/shared";
import { ApiVersion } from "@autumn/shared";
import type { TestHelpers } from "better-auth/plugins";
import { auth } from "@/utils/auth.js";

/**
 * Mint REAL better-auth dashboard sessions in the test process, then hit the
 * running server's session-authed internal routes over HTTP. Backed by the
 * better-auth testUtils plugin (enabled when NODE_ENV !== "production").
 */

type DashboardCtx = {
	org: { id: string };
	env: AppEnv;
};

export interface DashboardSession {
	headers: Headers;
	userId: string;
	cleanup: () => Promise<void>;
}

const baseUrl = () =>
	process.env.AUTUMN_TEST_BASE_URL?.replace(/\/$/, "") ??
	`http://localhost:${process.env.SERVER_PORT ?? "8080"}`;

const getTestHelpers = async (): Promise<TestHelpers> => {
	const ctx = await auth.$context;
	// Conditional plugin spread defeats static inference; cast at the boundary.
	const test = (ctx as { test?: TestHelpers }).test;
	if (!test) {
		throw new Error(
			"better-auth testUtils not available — ensure NODE_ENV !== 'production'",
		);
	}
	return test;
};

/**
 * Create a session for a fresh user that is a member of ctx.org, with the
 * active organization set so betterAuthMiddleware resolves it. Defaults to an
 * owner so customSession grants the broadest scopes.
 */
export const createDashboardSession = async (
	ctx: DashboardCtx,
	{ role = "owner" }: { role?: string } = {},
): Promise<DashboardSession> => {
	const test = await getTestHelpers();

	const user = await test.saveUser(test.createUser());
	await test.addMember?.({
		userId: user.id,
		organizationId: ctx.org.id,
		role,
	});

	const { headers } = await test.login({ userId: user.id });

	// betterAuthMiddleware requires session.activeOrganizationId.
	await auth.api.setActiveOrganization({
		headers,
		body: { organizationId: ctx.org.id },
	});

	return {
		headers,
		userId: user.id,
		cleanup: () => test.deleteUser(user.id),
	};
};

const buildHeaders = (ctx: DashboardCtx, session: DashboardSession) => {
	const headers = new Headers(session.headers);
	headers.set("app_env", ctx.env);
	if (!headers.has("x-api-version")) {
		headers.set("x-api-version", ApiVersion.V2_1);
	}
	return headers;
};

/**
 * Fetch an internal/dashboard route with a real session. Returns the raw
 * status and parsed JSON (null body tolerated).
 */
export const dashboardFetch = async <T = unknown>(
	ctx: DashboardCtx,
	session: DashboardSession,
	path: string,
	init: RequestInit = {},
): Promise<{ status: number; data: T }> => {
	const headers = buildHeaders(ctx, session);
	if (init.headers) {
		new Headers(init.headers).forEach((v, k) => {
			headers.set(k, v);
		});
	}

	const res = await fetch(`${baseUrl()}${path}`, { ...init, headers });

	let data: T;
	try {
		data = (await res.json()) as T;
	} catch {
		data = null as T;
	}
	return { status: res.status, data };
};

export const dashboardGet = <T = unknown>(
	ctx: DashboardCtx,
	session: DashboardSession,
	path: string,
) => dashboardFetch<T>(ctx, session, path, { method: "GET" });
