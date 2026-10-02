import { afterAll, expect, mock, test } from "bun:test";
import type { AlienClient } from "@autumn/alien";
import {
	AppEnv,
	DEFAULT_BYOC_CACHE_MACHINE,
	type Organization,
} from "@autumn/shared";
import { cacheNames } from "@/internal/byoc/utils/byocCacheUtils.js";
import { encryptData } from "@/utils/encryptUtils.js";

const previous = {
	ATOM_URL: process.env.ATOM_URL,
	ATOM_ADMIN_TOKEN: process.env.ATOM_ADMIN_TOKEN,
	ENCRYPTION_PASSWORD: process.env.ENCRYPTION_PASSWORD,
};

/** Every Atom route a deployer could reach on a multi-tenant Atom; a customer's cache must never land here. */
const multiTenantAtomCalls: string[] = [];
const multiTenantAtom = Bun.serve({
	port: 0,
	fetch: (request) => {
		multiTenantAtomCalls.push(new URL(request.url).pathname);
		return Response.json({ id: "anything" });
	},
});

const alienStarts: string[] = [];
const alienClient: AlienClient = {
	startSetup: async ({ externalId }) => {
		alienStarts.push(externalId);
		return { deploymentGroupId: "dg_1", setupUrl: "https://setup" };
	},
	findDeployment: async () => null,
	updateDeploymentCompute: async () => {},
	deleteDeployment: async () => {},
	revokeSetupLinks: async () => {},
};
const ALIEN_CLIENT_MODULE = "@/external/alien/getAlienClient.js";
// Kept so afterAll can hand the real module back: mock.module is process-wide.
const realAlienClientModule: Record<string, unknown> = await import(
	ALIEN_CLIENT_MODULE
);
mock.module(ALIEN_CLIENT_MODULE, () => ({
	...realAlienClientModule,
	getAlienClient: () => alienClient,
}));

afterAll(() => {
	mock.module(ALIEN_CLIENT_MODULE, () => realAlienClientModule);
	multiTenantAtom.stop(true);
	for (const [key, value] of Object.entries(previous)) {
		if (value === undefined) delete process.env[key];
		else process.env[key] = value;
	}
});

test("off a dev stack the customer path resolves alien, even beside a multi-tenant Atom and a configured shadow Atom", async () => {
	process.env.ENCRYPTION_PASSWORD = "customer-atom-deployer-test-password";
	process.env.ATOM_URL = multiTenantAtom.url.origin;
	process.env.ATOM_ADMIN_TOKEN = "atom_admin_test";
	const { _setShadowAtomConfigForTesting } = await import(
		"@/internal/misc/shadowAtom/shadowAtomConfigStore.js"
	);
	_setShadowAtomConfigForTesting({
		config: {
			sandbox: {
				endpointUrl: multiTenantAtom.url.origin,
				adminEncryptedToken: encryptData("atom_admin_test"),
			},
		},
	});
	const { getAtomDeployer } = await import(
		"@/internal/byoc/deployers/getAtomDeployer.js"
	);

	await getAtomDeployer().start({
		names: cacheNames({
			org: { id: "org_1", slug: "acme" } as Organization,
			env: AppEnv.Sandbox,
		}),
		auth: { mode: "deployed", tokenHash: "a".repeat(64) },
		machine: DEFAULT_BYOC_CACHE_MACHINE,
	});

	expect(alienStarts).toHaveLength(1);
	expect(multiTenantAtomCalls).toEqual([]);
});
