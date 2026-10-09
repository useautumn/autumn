import { describe, expect, test } from "bun:test";
import type { AlienClient, AlienDeployment } from "@autumn/alien";
import { getAutumnEnv } from "@autumn/env";
import {
	AppEnv,
	type ByocCacheNetwork,
	ByocCacheStage,
	ByocCacheStatus,
	DEFAULT_BYOC_CACHE_AWS_REGION,
	DEFAULT_BYOC_CACHE_MACHINE,
	type Organization,
} from "@autumn/shared";
import { createAlienAtomDeployer } from "@/internal/byoc/deployers/createAlienAtomDeployer.js";
import {
	cacheNames,
	shadowAtomCacheNames,
} from "@/internal/byoc/utils/byocCacheUtils.js";

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
		getDeployment: async () => null,
		retryDeployment: async () => {},
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
			names: cacheNames({ org, env: AppEnv.Sandbox }),
			auth: { mode: "deployed", tokenHash: "hash_1" },
			machine: DEFAULT_BYOC_CACHE_MACHINE,
			region: DEFAULT_BYOC_CACHE_AWS_REGION,
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
			names: cacheNames({ org, env: AppEnv.Sandbox }),
			auth: { mode: "deployed", tokenHash: "hash_1" },
			machine: DEFAULT_BYOC_CACHE_MACHINE,
			region: DEFAULT_BYOC_CACHE_AWS_REGION,
		});

		expect(started[0]?.pools).toEqual({
			stateful: { machine: "t4g.micro", machines: 1 },
		});
	});

	test("the setup opens in the chosen region", async () => {
		const { alienClient, started } = recordingAlienClient();
		const deployer = createAlienAtomDeployer({ alienClient });

		await deployer.start({
			names: cacheNames({ org, env: AppEnv.Sandbox }),
			auth: { mode: "deployed", tokenHash: "hash_1" },
			machine: DEFAULT_BYOC_CACHE_MACHINE,
			region: "eu-west-2",
		});

		expect(started[0]?.region).toBe("eu-west-2");
	});

	test("our shadow Atom starts multi-tenant, its ATOM_TOKEN_HASH the admin token's", async () => {
		const { alienClient, started } = recordingAlienClient();
		const deployer = createAlienAtomDeployer({ alienClient });

		await deployer.start({
			names: shadowAtomCacheNames(),
			auth: { mode: "multi_tenant", tokenHash: "admin_hash" },
			machine: DEFAULT_BYOC_CACHE_MACHINE,
			region: DEFAULT_BYOC_CACHE_AWS_REGION,
		});

		expect(started[0]?.environmentVariables).toEqual([
			{
				name: "ATOM_MODE",
				value: "multi_tenant",
				type: "plain",
				targetResources: null,
			},
			{
				name: "ATOM_TOKEN_HASH",
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

describe("an Atom's network on alien", () => {
	const start = async (network: ByocCacheNetwork | null) => {
		const { alienClient, started } = recordingAlienClient();
		await createAlienAtomDeployer({ alienClient }).start({
			names: cacheNames({ org, env: AppEnv.Sandbox }),
			auth: { mode: "deployed", tokenHash: "hash_1" },
			machine: DEFAULT_BYOC_CACHE_MACHINE,
			region: DEFAULT_BYOC_CACHE_AWS_REGION,
			network,
		});
		return started[0]?.network;
	};

	test("an existing VPC keeps Atom on its private subnets", async () => {
		expect(
			await start({
				type: "existing_vpc",
				vpc_id: "vpc_1",
				subnet_ids: ["subnet_a", "subnet_b"],
			}),
		).toEqual({
			type: "byo-vpc-aws",
			vpc_id: "vpc_1",
			private_subnet_ids: ["subnet_a", "subnet_b"],
			public_subnet_ids: [],
		});
	});

	test("a new VPC is one alien creates; none takes alien's default", async () => {
		expect(await start({ type: "new_vpc" })).toEqual({ type: "create" });
		expect(await start(null)).toBeNull();
	});
});

/** An alien client whose deployments are looked up by id or by group. */
const deploymentsAlienClient = ({
	byId,
	byGroup,
}: {
	byId: AlienDeployment | null;
	byGroup: AlienDeployment | null;
}): AlienClient => ({
	...recordingAlienClient().alienClient,
	getDeployment: async () => byId,
	findDeployment: async () => byGroup,
});

const deploymentIn = (status: string): AlienDeployment => ({
	id: "dep_1",
	status,
	region: "eu-west-2",
	stackState: {
		resources: {
			"compute-cluster": {
				config: { id: "compute-cluster", type: "compute-cluster" },
				status: "running",
			},
			atom: {
				config: { id: "atom", type: "container" },
				status: status === "running" ? "running" : "provisioning",
				outputs: {
					volumes: [{ ordinal: 0, volumeId: "vol_1", zone: "eu-west-2a" }],
					publicEndpoints:
						status === "running"
							? { default: { url: "https://atom.example" } }
							: {},
				},
			},
		},
	},
});

describe("finding an Atom on alien", () => {
	test("a provisioning deployment reports the steps alien has finished", async () => {
		const deployer = createAlienAtomDeployer({
			alienClient: deploymentsAlienClient({
				byId: null,
				byGroup: deploymentIn("provisioning"),
			}),
		});

		const atom = await deployer.find({ deploymentGroupId: "dg_1" });

		expect(atom?.status).toBe(ByocCacheStatus.Provisioning);
		expect(atom?.region).toBe("eu-west-2");
		expect(atom?.doneStages).toEqual([
			ByocCacheStage.Stack,
			ByocCacheStage.Disk,
			ByocCacheStage.Machine,
		]);
	});

	test("a running deployment has every step done but connected", async () => {
		const deployer = createAlienAtomDeployer({
			alienClient: deploymentsAlienClient({
				byId: deploymentIn("running"),
				byGroup: null,
			}),
		});

		const atom = await deployer.find({
			deploymentGroupId: "dg_1",
			deploymentId: "dep_1",
		});

		expect(atom?.endpointUrl).toBe("https://atom.example");
		expect(atom?.doneStages).toEqual([
			ByocCacheStage.Stack,
			ByocCacheStage.Disk,
			ByocCacheStage.Machine,
			ByocCacheStage.LoadBalancer,
			ByocCacheStage.Atom,
		]);
	});

	test("a known deployment is followed through its delete", async () => {
		const removing = createAlienAtomDeployer({
			alienClient: deploymentsAlienClient({
				byId: deploymentIn("deleting"),
				byGroup: null,
			}),
		});
		const teardown = createAlienAtomDeployer({
			alienClient: deploymentsAlienClient({
				byId: deploymentIn("teardown-required"),
				byGroup: null,
			}),
		});
		const found = { deploymentGroupId: "dg_1", deploymentId: "dep_1" };

		expect((await removing.find(found))?.status).toBe(ByocCacheStatus.Removing);
		expect((await teardown.find(found))?.status).toBe(
			ByocCacheStatus.TeardownRequired,
		);
	});

	test("a deleted deployment gives way to whatever the group runs now", async () => {
		const deployer = createAlienAtomDeployer({
			alienClient: deploymentsAlienClient({
				byId: deploymentIn("deleted"),
				byGroup: null,
			}),
		});

		expect(
			await deployer.find({ deploymentGroupId: "dg_1", deploymentId: "dep_1" }),
		).toBeNull();
	});
});
