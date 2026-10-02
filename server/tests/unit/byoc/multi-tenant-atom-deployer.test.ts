import { afterAll, afterEach, beforeAll, expect, spyOn, test } from "bun:test";
import {
	type ShadowAtomConfig,
	ShadowAtomConfigSchema,
} from "@autumn/edge-config";
import { RecaseError, Scopes } from "@autumn/shared";
import { Hono } from "hono";
import { z } from "zod/v4";
import * as lockModule from "@/external/redis/utils/lockUtils/withLock.js";
import type { HonoEnv } from "@/honoUtils/HonoEnv.js";
import { handleRegisterAdminShadowAtomOrg } from "@/internal/admin/handleRegisterAdminShadowAtomOrg.js";
import { handleUnregisterAdminShadowAtomOrg } from "@/internal/admin/handleUnregisterAdminShadowAtomOrg.js";
import { createMultiTenantAtomDeployer } from "@/internal/byoc/deployers/createMultiTenantAtomDeployer.js";
import { atomTokenToHash } from "@/internal/byoc/utils/atomTokenUtils.js";
import { shadowAtomConfigStore } from "@/internal/misc/shadowAtom/shadowAtomConfigStore.js";
import { OrgService } from "@/internal/orgs/OrgService.js";
import { decryptData, encryptData } from "@/utils/encryptUtils.js";

const ADMIN_TOKEN = "atom_admin_test";
const previousPassword = process.env.ENCRYPTION_PASSWORD;
process.env.ENCRYPTION_PASSWORD = "multi-tenant-atom-deployer-test-password";

type Received = { route: string; adminToken: string | null; body: unknown };

/** A multi-tenant Atom's admin routes: only the admin token gets past them, as in apps/atom. */
const received: Received[] = [];
const multiTenantAtom = Bun.serve({
	port: 0,
	fetch: async (request) => {
		const { pathname } = new URL(request.url);
		if (!pathname.startsWith("/v1/atoms."))
			return new Response("not found", { status: 404 });
		const route = pathname.slice("/v1/".length);
		const adminToken = request.headers.get("x-atom-admin-token");
		const body = (await request.json()) as { id: string };
		received.push({ route, adminToken, body });
		if (adminToken !== ADMIN_TOKEN)
			return Response.json(
				{ code: "atom_admin_token_required" },
				{ status: 401 },
			);
		if (route === "atoms.delete")
			return Response.json({ id: body.id, deleted: true });
		return Response.json({ id: body.id });
	},
});

let stored: ShadowAtomConfig = ShadowAtomConfigSchema.parse({});
const read = spyOn(shadowAtomConfigStore, "readFromSource").mockImplementation(
	async () => structuredClone(stored),
);
const write = spyOn(shadowAtomConfigStore, "writeToSource").mockImplementation(
	async ({ config }) => {
		stored = config;
	},
);
const getOrg = spyOn(OrgService, "get").mockImplementation(
	async ({ orgId }) => {
		if (orgId === "org_missing")
			throw new RecaseError({
				message: "Organization not found",
				code: "org_not_found",
				statusCode: 404,
			});
		return { id: orgId } as Awaited<ReturnType<typeof OrgService.get>>;
	},
);

/** Redis's lock, held in-process: each key runs its holders one at a time. */
const lockedKeys: string[] = [];
const held = new Map<string, Promise<unknown>>();
const withLock = spyOn(lockModule, "withLock").mockImplementation(
	async ({ lockKey, fn }) => {
		lockedKeys.push(lockKey);
		const previous = held.get(lockKey) ?? Promise.resolve();
		const run = previous.then(fn, fn);
		held.set(
			lockKey,
			run.catch(() => {}),
		);
		return run;
	},
);

const useShadowAtom = ({
	endpointUrl = multiTenantAtom.url.origin,
	adminToken = ADMIN_TOKEN as string | null,
}: {
	endpointUrl?: string | null;
	adminToken?: string | null;
} = {}) => {
	stored = ShadowAtomConfigSchema.parse({
		sandbox: {
			endpointUrl,
			adminEncryptedToken: adminToken ? encryptData(adminToken) : null,
		},
	});
};

beforeAll(() => useShadowAtom());
afterEach(() => {
	received.length = 0;
	write.mockClear();
	useShadowAtom();
});
afterAll(() => {
	multiTenantAtom.stop(true);
	read.mockRestore();
	write.mockRestore();
	getOrg.mockRestore();
	withLock.mockRestore();
	if (previousPassword === undefined) delete process.env.ENCRYPTION_PASSWORD;
	else process.env.ENCRYPTION_PASSWORD = previousPassword;
});

const createApp = ({ scopes }: { scopes: string[] }) => {
	const app = new Hono<HonoEnv>();
	app.use("*", async (c, next) => {
		c.set("ctx", { scopes, db: {} } as unknown as HonoEnv["Variables"]["ctx"]);
		await next();
	});
	app.onError(
		(error) =>
			new Response(error.message, {
				status:
					error instanceof RecaseError
						? error.statusCode
						: error instanceof z.ZodError
							? 400
							: 500,
			}),
	);
	app.put(
		"/admin/shadow-atom-config/:env/orgs/:org_id",
		...handleRegisterAdminShadowAtomOrg,
	);
	app.delete(
		"/admin/shadow-atom-config/:env/orgs/:org_id",
		...handleUnregisterAdminShadowAtomOrg,
	);
	return app;
};

const register = ({
	orgId = "org_1",
	env = "sandbox",
	scopes = [Scopes.Superuser],
}: {
	orgId?: string;
	env?: string;
	scopes?: string[];
} = {}) =>
	createApp({ scopes }).request(
		`/admin/shadow-atom-config/${env}/orgs/${orgId}`,
		{ method: "PUT" },
	);

const unregister = ({
	orgId = "org_1",
	scopes = [Scopes.Superuser],
}: {
	orgId?: string;
	scopes?: string[];
} = {}) =>
	createApp({ scopes }).request(
		`/admin/shadow-atom-config/sandbox/orgs/${orgId}`,
		{ method: "DELETE" },
	);

test("the multi-tenant deployer puts an org with the admin token, and the Atom gets only the org token's hash", async () => {
	const deployer = createMultiTenantAtomDeployer({
		atom: { atomUrl: multiTenantAtom.url.origin, adminToken: ADMIN_TOKEN },
	});

	const { token } = await deployer.register({ atomId: "org_1.sandbox" });
	await deployer.unregister({ atomId: "org_1.sandbox" });

	expect(token).toStartWith("atom_");
	expect(received).toEqual([
		{
			route: "atoms.put",
			adminToken: ADMIN_TOKEN,
			body: { id: "org_1.sandbox", token_hash: atomTokenToHash({ token }) },
		},
		{
			route: "atoms.delete",
			adminToken: ADMIN_TOKEN,
			body: { id: "org_1.sandbox" },
		},
	]);
});

test("a multi-tenant Atom that refuses the admin token is a 503, not a silent success", async () => {
	const deployer = createMultiTenantAtomDeployer({
		atom: { atomUrl: multiTenantAtom.url.origin, adminToken: "wrong" },
	});

	expect(deployer.register({ atomId: "org_1.sandbox" })).rejects.toMatchObject({
		statusCode: 503,
	});
});

test("staff register an org: its token is answered once and stored only encrypted, under the env's orgs", async () => {
	const response = await register();

	expect(response.status).toBe(200);
	const { token, ...rest } = await response.json();
	expect(rest).toEqual({ env: "sandbox", org_id: "org_1" });
	expect(received[0]?.body).toEqual({
		id: "org_1.sandbox",
		token_hash: atomTokenToHash({ token }),
	});
	const registered = stored.sandbox.orgs.org_1;
	expect(registered && decryptData(registered.encryptedToken)).toBe(token);
	expect(JSON.stringify(stored)).not.toContain(token);
	expect(stored.live.orgs).toEqual({});
});

test("registering again rotates the org's token", async () => {
	const first = await (await register()).json();
	const second = await (await register()).json();

	expect(second.token).not.toBe(first.token);
	expect(decryptData(stored.sandbox.orgs.org_1?.encryptedToken ?? "")).toBe(
		second.token,
	);
});

test("staff unregister an org: it leaves the config, then the Atom deletes its folder", async () => {
	await register();
	received.length = 0;

	const response = await unregister();

	expect(await response.json()).toEqual({
		env: "sandbox",
		org_id: "org_1",
		deleted: true,
	});
	expect(stored.sandbox.orgs).toEqual({});
	expect(received).toEqual([
		{
			route: "atoms.delete",
			adminToken: ADMIN_TOKEN,
			body: { id: "org_1.sandbox" },
		},
	]);
});

test("nothing is registered without a shadow Atom address and admin token, or for an org that does not exist", async () => {
	for (const missing of [{ endpointUrl: null }, { adminToken: null }]) {
		useShadowAtom(missing);
		expect((await register()).status).toBe(400);
	}
	useShadowAtom();
	expect((await register({ orgId: "org_missing" })).status).toBe(404);
	expect((await register({ env: "staging" })).status).toBe(400);

	expect(received).toHaveLength(0);
	expect(write).not.toHaveBeenCalled();
});

test("an org's own key can neither register nor unregister", async () => {
	const scopes = [Scopes.Organisation.Write, Scopes.Organisation.Read];

	expect((await register({ scopes })).status).toBe(403);
	expect((await unregister({ scopes })).status).toBe(403);
	expect(received).toHaveLength(0);
	expect(write).not.toHaveBeenCalled();
});

test("two orgs registered at once both land: register and unregister hold the shadow Atom config's lock", async () => {
	const [first, second] = await Promise.all([
		register({ orgId: "org_1" }),
		register({ orgId: "org_2" }),
	]);
	await unregister({ orgId: "org_1" });

	expect([first.status, second.status]).toEqual([200, 200]);
	expect(Object.keys(stored.sandbox.orgs)).toEqual(["org_2"]);
	expect(new Set(lockedKeys)).toEqual(new Set(["admin:shadow-atom-config"]));
});

test("an Atom URL with a trailing slash still reaches the admin routes, and a redirect is refused rather than followed with the admin token", async () => {
	const deployer = createMultiTenantAtomDeployer({
		atom: {
			atomUrl: `${multiTenantAtom.url.origin}/`,
			adminToken: ADMIN_TOKEN,
		},
	});
	await deployer.register({ atomId: "org_1.sandbox" });
	expect(received[0]?.route).toBe("atoms.put");

	const elsewhere: string[] = [];
	const target = Bun.serve({
		port: 0,
		fetch: (request) => {
			elsewhere.push(request.headers.get("x-atom-admin-token") ?? "");
			return Response.json({ id: "x" });
		},
	});
	const redirecting = Bun.serve({
		port: 0,
		fetch: () => Response.redirect(`${target.url.origin}/v1/atoms.put`, 307),
	});
	const redirected = createMultiTenantAtomDeployer({
		atom: { atomUrl: redirecting.url.origin, adminToken: ADMIN_TOKEN },
	});

	expect(
		redirected.register({ atomId: "org_1.sandbox" }),
	).rejects.toMatchObject({ statusCode: 503 });
	await Bun.sleep(50);
	expect(elsewhere).toEqual([]);
	target.stop(true);
	redirecting.stop(true);
});
