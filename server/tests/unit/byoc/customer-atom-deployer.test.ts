import { afterAll, expect, mock, test } from "bun:test";
import type { AlienClient } from "@autumn/alien";
import {
	AppEnv,
	DEFAULT_BYOC_CACHE_MACHINE,
	type Organization,
} from "@autumn/shared";
import { encryptData } from "@/utils/encryptUtils.js";

const previous = {
	ATOM_URL: process.env.ATOM_URL,
	ATOM_ADMIN_TOKEN: process.env.ATOM_ADMIN_TOKEN,
	ENCRYPTION_PASSWORD: process.env.ENCRYPTION_PASSWORD,
};

/** Every Atom route a deployer could reach on a shared Atom; a customer's cache must never land here. */
const sharedAtomCalls: string[] = [];
const sharedAtom = Bun.serve({
	port: 0,
	fetch: (request) => {
		sharedAtomCalls.push(new URL(request.url).pathname);
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
mock.module("@/external/alien/getAlienClient.js", () => ({
	getAlienClient: () => alienClient,
}));

afterAll(() => {
	sharedAtom.stop(true);
	for (const [key, value] of Object.entries(previous)) {
		if (value === undefined) delete process.env[key];
		else process.env[key] = value;
	}
});

test("off a dev stack the customer path resolves alien, even beside a shared Atom and a configured shadow Atom", async () => {
	process.env.ENCRYPTION_PASSWORD = "customer-atom-deployer-test-password";
	process.env.ATOM_URL = sharedAtom.url.origin;
	process.env.ATOM_ADMIN_TOKEN = "atom_admin_test";
	const { _setShadowAtomConfigForTesting } = await import(
		"@/internal/misc/shadowAtom/shadowAtomConfigStore.js"
	);
	_setShadowAtomConfigForTesting({
		config: {
			sandbox: {
				endpointUrl: sharedAtom.url.origin,
				adminEncryptedToken: encryptData("atom_admin_test"),
			},
		},
	});
	const { getAtomDeployer } = await import(
		"@/internal/byoc/deployers/getAtomDeployer.js"
	);

	await getAtomDeployer().start({
		org: { id: "org_1", slug: "acme" } as Organization,
		env: AppEnv.Sandbox,
		tokenHash: "a".repeat(64),
		machine: DEFAULT_BYOC_CACHE_MACHINE,
	});

	expect(alienStarts).toHaveLength(1);
	expect(sharedAtomCalls).toEqual([]);
});
