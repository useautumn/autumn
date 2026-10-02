import { afterAll, afterEach, expect, spyOn, test } from "bun:test";
import { ShadowAtomConfigSchema, shadowAtomConfig } from "@autumn/edge-config";
import { RecaseError, Scopes } from "@autumn/shared";
import { Hono } from "hono";
import { z } from "zod/v4";
import * as lockModule from "@/external/redis/utils/lockUtils/withLock.js";
import type { HonoEnv } from "@/honoUtils/HonoEnv.js";
import { handleGetAdminShadowAtomConfig } from "@/internal/admin/handleGetAdminShadowAtomConfig.js";
import { handleMintAdminShadowAtomToken } from "@/internal/admin/handleMintAdminShadowAtomToken.js";
import { handleSetAdminShadowAtomOrgPercent } from "@/internal/admin/handleSetAdminShadowAtomOrgPercent.js";
import { handleUpsertAdminShadowAtomConfig } from "@/internal/admin/handleUpsertAdminShadowAtomConfig.js";
import { atomTokenToHash } from "@/internal/byoc/utils/atomTokenUtils.js";
import { shadowAtomConfigStore } from "@/internal/misc/shadowAtom/shadowAtomConfigStore.js";
import { decryptData } from "@/utils/encryptUtils.js";

const previousPassword = process.env.ENCRYPTION_PASSWORD;
process.env.ENCRYPTION_PASSWORD = "shadow-atom-admin-test-password";

const lockedKeys: string[] = [];
const withLock = spyOn(lockModule, "withLock").mockImplementation(
	async ({ lockKey, fn }) => {
		lockedKeys.push(lockKey);
		return fn();
	},
);
const write = spyOn(shadowAtomConfigStore, "writeToSource").mockResolvedValue();
const read = spyOn(shadowAtomConfigStore, "readFromSource").mockResolvedValue(
	shadowAtomConfig.defaultValue(),
);

afterEach(() => {
	lockedKeys.length = 0;
	write.mockClear();
	read.mockClear();
});
afterAll(() => {
	if (previousPassword === undefined) delete process.env.ENCRYPTION_PASSWORD;
	else process.env.ENCRYPTION_PASSWORD = previousPassword;
	write.mockRestore();
	read.mockRestore();
	withLock.mockRestore();
});

const createApp = ({ scopes }: { scopes: string[] }) => {
	const app = new Hono<HonoEnv>();
	app.use("*", async (c, next) => {
		c.set("ctx", { scopes } as HonoEnv["Variables"]["ctx"]);
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
	app.get("/admin/shadow-atom-config", ...handleGetAdminShadowAtomConfig);
	app.put("/admin/shadow-atom-config", ...handleUpsertAdminShadowAtomConfig);
	app.post(
		"/admin/shadow-atom-config/token",
		...handleMintAdminShadowAtomToken,
	);
	app.patch(
		"/admin/shadow-atom-config/:env/orgs/:org_id",
		...handleSetAdminShadowAtomOrgPercent,
	);
	return app;
};

const save = ({ config, scopes }: { config: unknown; scopes: string[] }) =>
	createApp({ scopes }).request("/admin/shadow-atom-config", {
		method: "PUT",
		headers: { "Content-Type": "application/json" },
		body: JSON.stringify(config),
	});

test("staff save a shadow Atom's address", async () => {
	const response = await save({
		scopes: [Scopes.Superuser],
		config: { sandbox: { endpointUrl: "https://shadow-atom.example.com" } },
	});

	expect(response.status).toBe(200);
	expect(write).toHaveBeenCalledTimes(1);
	expect(lockedKeys).toEqual(["admin:shadow-atom-config"]);
	expect(write.mock.calls[0][0].config.sandbox.endpointUrl).toBe(
		"https://shadow-atom.example.com",
	);
});

test("an org's own key cannot read or write the shadow Atom config", async () => {
	const scopes = [Scopes.Organisation.Write, Scopes.Organisation.Read];
	const saved = await save({ scopes, config: {} });
	const fetched = await createApp({ scopes }).request(
		"/admin/shadow-atom-config",
	);

	expect(saved.status).toBe(403);
	expect(fetched.status).toBe(403);
	expect(write).not.toHaveBeenCalled();
});

test("staff read the shadow Atom config with no token in it: whether the admin token is set, and when each org was registered", async () => {
	read.mockResolvedValueOnce(
		ShadowAtomConfigSchema.parse({
			sandbox: {
				endpointUrl: "https://shadow-atom.example.com",
				adminEncryptedToken: "encrypted_admin",
				orgs: {
					org_1: {
						encryptedToken: "encrypted_org_1",
						registeredAt: 7,
						percent: 40,
					},
				},
			},
		}),
	);
	const response = await createApp({ scopes: [Scopes.Superuser] }).request(
		"/admin/shadow-atom-config",
	);

	expect(response.status).toBe(200);
	const body = await response.json();
	expect(body.sandbox).toEqual({
		endpointUrl: "https://shadow-atom.example.com",
		hasAdminToken: true,
		orgs: { org_1: { registeredAt: 7, percent: 40 } },
	});
	expect(body.live).toEqual({
		endpointUrl: null,
		hasAdminToken: false,
		orgs: {},
	});
});

test("a save cannot touch the admin token or the registered orgs, and answers without them", async () => {
	const stored = ShadowAtomConfigSchema.parse({
		sandbox: {
			adminEncryptedToken: "encrypted_admin",
			orgs: {
				org_1: {
					encryptedToken: "encrypted_org_1",
					registeredAt: 7,
					percent: 40,
				},
			},
		},
	});
	read.mockResolvedValueOnce(stored);

	const response = await save({
		scopes: [Scopes.Superuser],
		config: {
			sandbox: {
				endpointUrl: "https://shadow-atom.example.com",
				adminEncryptedToken: "forged",
				orgs: {
					org_2: { encryptedToken: "forged", registeredAt: 1, percent: 100 },
				},
			},
		},
	});

	const saved = write.mock.calls[0][0].config.sandbox;
	expect(saved.adminEncryptedToken).toBe("encrypted_admin");
	expect(saved.orgs).toEqual(stored.sandbox.orgs);
	const body = await response.json();
	expect(Object.keys(body.sandbox).sort()).toEqual([
		"endpointUrl",
		"hasAdminToken",
		"orgs",
	]);
	expect(body.sandbox.orgs).toEqual({
		org_1: { registeredAt: 7, percent: 40 },
	});
});

const mint = ({ env, scopes }: { env: string; scopes: string[] }) =>
	createApp({ scopes }).request("/admin/shadow-atom-config/token", {
		method: "POST",
		headers: { "Content-Type": "application/json" },
		body: JSON.stringify({ env }),
	});

test("staff mint an env's admin token: stored encrypted, its hash returned once for the multi-tenant Atom's ATOM_TOKEN_HASH", async () => {
	const response = await mint({ env: "live", scopes: [Scopes.Superuser] });

	expect(response.status).toBe(200);
	const body = await response.json();
	const saved = write.mock.calls[0][0].config;
	const token = decryptData(saved.live.adminEncryptedToken ?? "");
	expect(token).toStartWith("atom_");
	expect(body).toEqual({
		env: "live",
		admin_token_hash: atomTokenToHash({ token }),
	});
	expect(saved.sandbox.adminEncryptedToken).toBeNull();
});

test("an org's own key cannot mint the shadow Atom's admin token", async () => {
	const response = await mint({
		env: "live",
		scopes: [Scopes.Organisation.Write],
	});

	expect(response.status).toBe(403);
	expect(write).not.toHaveBeenCalled();
});

const setPercent = ({
	orgId,
	percent,
	scopes = [Scopes.Superuser],
}: {
	orgId: string;
	percent: number;
	scopes?: string[];
}) =>
	createApp({ scopes }).request(
		`/admin/shadow-atom-config/sandbox/orgs/${orgId}`,
		{
			method: "PATCH",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({ percent }),
		},
	);

test("staff change a registered org's percent; it routes from what routed before until it settles", async () => {
	read.mockResolvedValueOnce(
		ShadowAtomConfigSchema.parse({
			sandbox: {
				orgs: {
					org_1: {
						encryptedToken: "encrypted_org_1",
						registeredAt: 7,
						percent: 40,
						previousPercent: 40,
					},
				},
			},
		}),
	);

	const response = await setPercent({ orgId: "org_1", percent: 70 });

	expect(response.status).toBe(200);
	expect(lockedKeys).toEqual(["admin:shadow-atom-config"]);
	expect(write.mock.calls[0][0].config.sandbox.orgs.org_1).toMatchObject({
		encryptedToken: "encrypted_org_1",
		percent: 70,
		previousPercent: 40,
	});
});

test("an org that is not registered has no percent to set, and a percent outside 0–100 is refused", async () => {
	expect((await setPercent({ orgId: "org_9", percent: 50 })).status).toBe(404);
	expect((await setPercent({ orgId: "org_1", percent: 150 })).status).toBe(400);
	expect(
		(
			await setPercent({
				orgId: "org_1",
				percent: 50,
				scopes: [Scopes.Organisation.Write],
			})
		).status,
	).toBe(403);
	expect(write).not.toHaveBeenCalled();
});
