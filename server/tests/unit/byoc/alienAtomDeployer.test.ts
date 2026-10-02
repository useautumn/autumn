import { describe, expect, test } from "bun:test";
import type { AlienClient } from "@autumn/alien";
import { getAutumnEnv } from "@autumn/env";
import {
	AppEnv,
	DEFAULT_BYOC_CACHE_MACHINE,
	type Organization,
} from "@autumn/shared";
import { createAlienAtomDeployer } from "@/internal/byoc/deployers/createAlienAtomDeployer.js";

const org = { id: "org_1", slug: "acme" } as Organization;

/** An alien client that only records what a setup was started with. */
const recordingAlienClient = () => {
	const started: Parameters<AlienClient["startSetup"]>[0][] = [];
	const alienClient: AlienClient = {
		startSetup: async (params) => {
			started.push(params);
			return { deploymentGroupId: "dg_1", setupUrl: "https://setup" };
		},
		findDeployment: async () => null,
		updateDeploymentCompute: async () => {},
		deleteDeployment: async () => {},
		revokeSetupLinks: async () => {},
	};
	return { alienClient, started };
};

describe("starting an Atom on alien", () => {
	test("the container gets the token hash and this environment's API URL to forward to", async () => {
		const { alienClient, started } = recordingAlienClient();
		const deployer = createAlienAtomDeployer({ alienClient });

		await deployer.start({
			org,
			env: AppEnv.Sandbox,
			auth: { mode: "deployed", tokenHash: "hash_1" },
			machine: DEFAULT_BYOC_CACHE_MACHINE,
		});

		expect(started).toHaveLength(1);
		expect(started[0]?.environmentVariables).toEqual([
			{
				name: "ATOM_TOKEN_HASH",
				value: "hash_1",
				type: "plain",
				targetResources: null,
			},
			{
				name: "AUTUMN_API_URL",
				value: getAutumnEnv().AUTUMN_PUBLIC_API_URL,
				type: "plain",
				targetResources: null,
			},
		]);
	});

	test("the setup defaults the Atom's pool to the chosen machine", async () => {
		const { alienClient, started } = recordingAlienClient();
		const deployer = createAlienAtomDeployer({ alienClient });

		await deployer.start({
			org,
			env: AppEnv.Sandbox,
			auth: { mode: "deployed", tokenHash: "hash_1" },
			machine: DEFAULT_BYOC_CACHE_MACHINE,
		});

		expect(started[0]?.pools).toEqual({
			stateful: { machine: "t4g.micro", machines: 1 },
		});
	});

	test("our shadow Atom starts in shared mode with only the admin token hash", async () => {
		const { alienClient, started } = recordingAlienClient();
		const deployer = createAlienAtomDeployer({ alienClient });

		await deployer.start({
			org,
			env: AppEnv.Sandbox,
			auth: { mode: "shared", adminTokenHash: "admin_hash" },
			machine: DEFAULT_BYOC_CACHE_MACHINE,
		});

		expect(started[0]?.environmentVariables).toEqual([
			{
				name: "ATOM_MODE",
				value: "shared",
				type: "plain",
				targetResources: null,
			},
			{
				name: "ATOM_ADMIN_TOKEN_HASH",
				value: "admin_hash",
				type: "plain",
				targetResources: null,
			},
			{
				name: "AUTUMN_API_URL",
				value: getAutumnEnv().AUTUMN_PUBLIC_API_URL,
				type: "plain",
				targetResources: null,
			},
		]);
	});
});
