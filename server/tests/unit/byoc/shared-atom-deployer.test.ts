import { afterAll, afterEach, beforeAll, expect, spyOn, test } from "bun:test";
import {
	type ShadowAtomConfig,
	ShadowAtomConfigSchema,
} from "@autumn/edge-config";
import { RecaseError, Scopes } from "@autumn/shared";
import { Hono } from "hono";
import { z } from "zod/v4";
import type { HonoEnv } from "@/honoUtils/HonoEnv.js";
import { handleRegisterAdminShadowAtomOrg } from "@/internal/admin/handleRegisterAdminShadowAtomOrg.js";
import { handleUnregisterAdminShadowAtomOrg } from "@/internal/admin/handleUnregisterAdminShadowAtomOrg.js";
import { createSharedAtomDeployer } from "@/internal/byoc/deployers/createSharedAtomDeployer.js";
import { atomTokenToHash } from "@/internal/byoc/utils/atomTokenUtils.js";
import { shadowAtomConfigStore } from "@/internal/misc/shadowAtom/shadowAtomConfigStore.js";
import { OrgService } from "@/internal/orgs/OrgService.js";
import { decryptData, encryptData } from "@/utils/encryptUtils.js";

const ADMIN_TOKEN = "atom_admin_test";
const previousPassword = process.env.ENCRYPTION_PASSWORD;
process.env.ENCRYPTION_PASSWORD = "shared-atom-deployer-test-password";

type Received = { route: string; adminToken: string | null; body: unknown };

/** A shared Atom's admin routes: only the admin token gets past them, as in apps/atom. */
const received: Received[] = [];
const sharedAtom = Bun.serve({
	port: 0,
	fetch: async (request) => {
		const route = new URL(request.url).pathname.replace("/v1/", "");
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

const useShadowAtom = ({
	endpointUrl = sharedAtom.url.origin,
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
	sharedAtom.stop(true);
	read.mockRestore();
	write.mockRestore();
	getOrg.mockRestore();
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

test("the shared deployer puts an org with the admin token, and the Atom gets only the org token's hash", async () => {
	const deployer = createSharedAtomDeployer({
		atom: { atomUrl: sharedAtom.url.origin, adminToken: ADMIN_TOKEN },
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

test("a shared Atom that refuses the admin token is a 503, not a silent success", async () => {
	const deployer = createSharedAtomDeployer({
		atom: { atomUrl: sharedAtom.url.origin, adminToken: "wrong" },
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
