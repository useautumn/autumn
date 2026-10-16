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
	findByocCacheMachineByInstanceType,
	type Organization,
} from "@autumn/shared";
import { createAlienAtomDeployer } from "@/internal/byoc/deployers/createAlienAtomDeployer.js";
import {
	atomNames,
	cacheOwner,
	legacyShadowAtomNames,
} from "@/internal/byoc/utils/byocCacheUtils.js";

const org = { id: "org_1", slug: "acme" } as Organization;

/** Each size's machine and the Atom container that must run on it. */
const SIZE_CONTAINERS = [
	["t4g.micro", { cpu: 1, memory: "0.625Gi" }],
	["t4g.small", { cpu: 1, memory: "1.375Gi" }],
	["c8g.large", { cpu: 1, memory: "2.75Gi" }],
	["c8g.xlarge", { cpu: 3, memory: "6Gi" }],
	["c8g.2xlarge", { cpu: 7, memory: "12Gi" }],
	["c8g.4xlarge", { cpu: 15, memory: "24Gi" }],
] as const;

const sizeOn = ({ instanceType }: { instanceType: string }) => {
	const machine = findByocCacheMachineByInstanceType({ instanceType });
	if (!machine) throw new Error(`No size runs on ${instanceType}`);
	return machine;
};

/** An alien client that only records what a setup was started with. */
const recordingAlienClient = () => {
	const started: Parameters<AlienClient["startSetup"]>[0][] = [];
	const alienClient: AlienClient = {
		startSetup: async (params) => {
			started.push(params);
			return { deploymentGroupId: "dg_1", setupUrl: "https://setup" };
		},
		findDeploymentGroup: async () => null,
		findDeployment: async () => null,
		getDeployment: async () => null,
		retryDeployment: async () => {},
		updateDeploymentCompute: async () => {},
		deleteDeployment: async () => {},
		revokeSetupLinksOnceDeleted: async () => {},
	};
	return { alienClient, started };
};

describe("starting an Atom on alien", () => {
	test("the container gets the token hash and this environment's API URL to forward to", async () => {
		const { alienClient, started } = recordingAlienClient();
		const deployer = createAlienAtomDeployer({ alienClient });

		await deployer.start({
			names: atomNames({ owner: cacheOwner({ org, env: AppEnv.Sandbox }) }),
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
			names: atomNames({ owner: cacheOwner({ org, env: AppEnv.Sandbox }) }),
			auth: { mode: "deployed", tokenHash: "hash_1" },
			machine: DEFAULT_BYOC_CACHE_MACHINE,
			region: DEFAULT_BYOC_CACHE_AWS_REGION,
		});

		expect(started[0]?.pools).toEqual({
			stateful: { machine: "c8g.xlarge", machines: 2 },
		});
	});

	test("with no size named, the Atom container keeps the 3 vCPU / 6Gi it always had", async () => {
		const { alienClient, started } = recordingAlienClient();
		const deployer = createAlienAtomDeployer({ alienClient });

		await deployer.start({
			names: atomNames({ owner: cacheOwner({ org, env: AppEnv.Sandbox }) }),
			auth: { mode: "deployed", tokenHash: "hash_1" },
			machine: DEFAULT_BYOC_CACHE_MACHINE,
			region: DEFAULT_BYOC_CACHE_AWS_REGION,
		});

		expect(started[0]?.containers).toEqual({
			atom: { cpu: 3, memory: "6Gi" },
		});
	});

	test.each(SIZE_CONTAINERS)(
		"a %s size pins one machine per replica and sizes the Atom container to fit it",
		async (instanceType, container) => {
			const { alienClient, started } = recordingAlienClient();
			const deployer = createAlienAtomDeployer({ alienClient });
			const machine = sizeOn({ instanceType });

			await deployer.start({
				names: atomNames({ owner: cacheOwner({ org, env: AppEnv.Sandbox }) }),
				auth: { mode: "deployed", tokenHash: "hash_1" },
				machine,
				region: DEFAULT_BYOC_CACHE_AWS_REGION,
			});

			expect(started[0]?.pools).toEqual({
				stateful: { machine: instanceType, machines: 2 },
			});
			expect(started[0]?.containers).toEqual({ atom: container });
		},
	);

	test("the setup opens in the chosen region", async () => {
		const { alienClient, started } = recordingAlienClient();
		const deployer = createAlienAtomDeployer({ alienClient });

		await deployer.start({
			names: atomNames({ owner: cacheOwner({ org, env: AppEnv.Sandbox }) }),
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
			names: legacyShadowAtomNames(),
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
			names: atomNames({ owner: cacheOwner({ org, env: AppEnv.Sandbox }) }),
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

describe("resizing an Atom on alien", () => {
	/** An alien client running one deployment that records each compute update. */
	const resizingAlienClient = () => {
		const updates: Parameters<AlienClient["updateDeploymentCompute"]>[0][] = [];
		const alienClient: AlienClient = {
			...recordingAlienClient().alienClient,
			findDeployment: async () => deploymentIn("running"),
			updateDeploymentCompute: async (params) => {
				updates.push(params);
			},
		};
		return { alienClient, updates };
	};

	test.each(SIZE_CONTAINERS)(
		"a resize to %s moves the pool and resizes the Atom container with it",
		async (instanceType, container) => {
			const { alienClient, updates } = resizingAlienClient();
			const deployer = createAlienAtomDeployer({ alienClient });

			await deployer.resize({
				deploymentGroupId: "dg_1",
				machine: sizeOn({ instanceType }),
			});

			expect(updates).toHaveLength(1);
			expect(updates[0]?.pools).toEqual({
				stateful: { machine: instanceType, machines: 2 },
			});
			expect(updates[0]?.containers).toEqual({ atom: container });
		},
	);

	test("a resize sends the same container size a fresh Atom of that size starts with", async () => {
		const { alienClient: startClient, started } = recordingAlienClient();
		const { alienClient: resizeClient, updates } = resizingAlienClient();
		const machine = sizeOn({ instanceType: "c8g.2xlarge" });

		await createAlienAtomDeployer({ alienClient: startClient }).start({
			names: atomNames({ owner: cacheOwner({ org, env: AppEnv.Sandbox }) }),
			auth: { mode: "deployed", tokenHash: "hash_1" },
			machine,
			region: DEFAULT_BYOC_CACHE_AWS_REGION,
		});
		await createAlienAtomDeployer({ alienClient: resizeClient }).resize({
			deploymentGroupId: "dg_1",
			machine,
		});

		expect(updates[0]?.pools).toEqual(started[0]?.pools);
		expect(updates[0]?.containers).toEqual(started[0]?.containers);
	});

	test("a group with no deployment refuses the resize and changes nothing", async () => {
		const { alienClient, updates } = resizingAlienClient();
		const deployer = createAlienAtomDeployer({
			alienClient: { ...alienClient, findDeployment: async () => null },
		});

		await expect(
			deployer.resize({
				deploymentGroupId: "dg_1",
				machine: sizeOn({ instanceType: "c8g.large" }),
			}),
		).rejects.toThrow();
		expect(updates).toHaveLength(0);
	});
});
