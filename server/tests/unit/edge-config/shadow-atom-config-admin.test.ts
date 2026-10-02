import { afterAll, afterEach, expect, spyOn, test } from "bun:test";
import { ShadowAtomConfigSchema, shadowAtomConfig } from "@autumn/edge-config";
import { RecaseError, Scopes } from "@autumn/shared";
import { Hono } from "hono";
import { z } from "zod/v4";
import type { HonoEnv } from "@/honoUtils/HonoEnv.js";
import { handleGetAdminShadowAtomConfig } from "@/internal/admin/handleGetAdminShadowAtomConfig.js";
import { handleMintAdminShadowAtomToken } from "@/internal/admin/handleMintAdminShadowAtomToken.js";
import { handleUpsertAdminShadowAtomConfig } from "@/internal/admin/handleUpsertAdminShadowAtomConfig.js";
import { atomTokenToHash } from "@/internal/byoc/utils/atomTokenUtils.js";
import { shadowAtomConfigStore } from "@/internal/misc/shadowAtom/shadowAtomConfigStore.js";
import { decryptData } from "@/utils/encryptUtils.js";

const previousPassword = process.env.ENCRYPTION_PASSWORD;
process.env.ENCRYPTION_PASSWORD = "shadow-atom-admin-test-password";

const write = spyOn(shadowAtomConfigStore, "writeToSource").mockResolvedValue();
const read = spyOn(shadowAtomConfigStore, "readFromSource").mockResolvedValue(
	shadowAtomConfig.defaultValue(),
);

afterEach(() => {
	write.mockClear();
	read.mockClear();
});
afterAll(() => {
	if (previousPassword === undefined) delete process.env.ENCRYPTION_PASSWORD;
	else process.env.ENCRYPTION_PASSWORD = previousPassword;
	write.mockRestore();
	read.mockRestore();
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
	return app;
};

const save = ({ config, scopes }: { config: unknown; scopes: string[] }) =>
	createApp({ scopes }).request("/admin/shadow-atom-config", {
		method: "PUT",
		headers: { "Content-Type": "application/json" },
		body: JSON.stringify(config),
	});

test("staff save a shadow Atom: its address, an env percent and an org override, scheduled from what routes now", async () => {
	const response = await save({
		scopes: [Scopes.Superuser],
		config: {
			sandbox: {
				endpointUrl: "https://shadow-atom.example.com",
				rollout: { percent: 10, previousPercent: 99, orgs: { org_1: 50 } },
			},
		},
	});

	expect(response.status).toBe(200);
	expect(write).toHaveBeenCalledTimes(1);
	expect(write.mock.calls[0][0].config.sandbox).toMatchObject({
		endpointUrl: "https://shadow-atom.example.com",
		rollout: { percent: 10, previousPercent: 0, orgs: { org_1: 50 } },
	});
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

test("a percent outside 0–100 is refused", async () => {
	const response = await save({
		scopes: [Scopes.Superuser],
		config: { live: { rollout: { percent: 150 } } },
	});

	expect(response.status).toBe(400);
	expect(write).not.toHaveBeenCalled();
});

test("staff read the shadow Atom config with no token in it: whether the admin token is set, and when each org was registered", async () => {
	read.mockResolvedValueOnce(
		ShadowAtomConfigSchema.parse({
			sandbox: {
				endpointUrl: "https://shadow-atom.example.com",
				adminEncryptedToken: "encrypted_admin",
				orgs: { org_1: { encryptedToken: "encrypted_org_1", registeredAt: 7 } },
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
		orgs: { org_1: { registeredAt: 7 } },
		rollout: shadowAtomConfig.defaultValue().sandbox.rollout,
	});
	expect(body.live).toMatchObject({ hasAdminToken: false, orgs: {} });
	expect(JSON.stringify(body)).not.toContain("encrypted");
});

test("a save cannot touch the admin token or the registered orgs, and answers without them", async () => {
	const stored = ShadowAtomConfigSchema.parse({
		sandbox: {
			adminEncryptedToken: "encrypted_admin",
			orgs: { org_1: { encryptedToken: "encrypted_org_1", registeredAt: 7 } },
		},
	});
	read.mockResolvedValueOnce(stored);

	const response = await save({
		scopes: [Scopes.Superuser],
		config: {
			sandbox: {
				endpointUrl: "https://shadow-atom.example.com",
				adminEncryptedToken: "forged",
				orgs: { org_2: { encryptedToken: "forged", registeredAt: 1 } },
			},
		},
	});

	const saved = write.mock.calls[0][0].config.sandbox;
	expect(saved.adminEncryptedToken).toBe("encrypted_admin");
	expect(saved.orgs).toEqual(stored.sandbox.orgs);
	expect(JSON.stringify(await response.json())).not.toContain("encrypted");
});

const mint = ({ env, scopes }: { env: string; scopes: string[] }) =>
	createApp({ scopes }).request("/admin/shadow-atom-config/token", {
		method: "POST",
		headers: { "Content-Type": "application/json" },
		body: JSON.stringify({ env }),
	});

test("staff mint an env's admin token: stored encrypted, its hash returned once for the multi-tenant Atom's ATOM_ADMIN_TOKEN_HASH", async () => {
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
