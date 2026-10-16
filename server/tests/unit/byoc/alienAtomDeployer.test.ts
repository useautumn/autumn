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
	DEFAULT_BYOC_CACHE_VOLUME_GIB,
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
			volumeSizeGib: DEFAULT_BYOC_CACHE_VOLUME_GIB,
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
			volumeSizeGib: DEFAULT_BYOC_CACHE_VOLUME_GIB,
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
			volumeSizeGib: DEFAULT_BYOC_CACHE_VOLUME_GIB,
		});

		expect(started[0]?.containers).toEqual({
			atom: { cpu: 3, memory: "6Gi", volumeSizeGib: 20 },
		});
	});

	test.each([
		["t4g.micro", { cpu: 1, memory: "0.625Gi" }],
		["t4g.small", { cpu: 1, memory: "1.375Gi" }],
		["c8g.large", { cpu: 1, memory: "2.75Gi" }],
		["c8g.xlarge", { cpu: 3, memory: "6Gi" }],
		["c8g.2xlarge", { cpu: 7, memory: "12Gi" }],
		["c8g.4xlarge", { cpu: 15, memory: "24Gi" }],
	])(
		"a %s size pins one machine per replica and sizes the Atom container to fit it",
		async (instanceType, container) => {
			const { alienClient, started } = recordingAlienClient();
			const deployer = createAlienAtomDeployer({ alienClient });
			const machine = findByocCacheMachineByInstanceType({ instanceType });
			if (!machine) throw new Error(`No size runs on ${instanceType}`);

			await deployer.start({
				names: atomNames({ owner: cacheOwner({ org, env: AppEnv.Sandbox }) }),
				auth: { mode: "deployed", tokenHash: "hash_1" },
				machine,
				region: DEFAULT_BYOC_CACHE_AWS_REGION,
				volumeSizeGib: DEFAULT_BYOC_CACHE_VOLUME_GIB,
			});

			expect(started[0]?.pools).toEqual({
				stateful: { machine: instanceType, machines: 2 },
			});
			expect(started[0]?.containers).toEqual({
				atom: { ...container, volumeSizeGib: 20 },
			});
		},
	);

	test("the setup opens in the chosen region", async () => {
		const { alienClient, started } = recordingAlienClient();
		const deployer = createAlienAtomDeployer({ alienClient });

		await deployer.start({
			names: atomNames({ owner: cacheOwner({ org, env: AppEnv.Sandbox }) }),
			auth: { mode: "deployed", tokenHash: "hash_1" },
			machine: DEFAULT_BYOC_CACHE_MACHINE,
			volumeSizeGib: DEFAULT_BYOC_CACHE_VOLUME_GIB,
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
			volumeSizeGib: DEFAULT_BYOC_CACHE_VOLUME_GIB,
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
			volumeSizeGib: DEFAULT_BYOC_CACHE_VOLUME_GIB,
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

/** An alien client running one deployment that selects `volumeSizeGib`, recording each compute update. */
const growingAlienClient = ({
	volumeSizeGib,
}: {
	volumeSizeGib: number | null;
}) => {
	const updates: Parameters<AlienClient["updateDeploymentCompute"]>[0][] = [];
	const deployment: AlienDeployment = {
		...deploymentIn("running"),
		stackSettings: {
			compute: {
				pools: {
					stateful: { mode: "fixed", machines: 2, machine: "c8g.xlarge" },
				},
				containers: { atom: { cpu: 3, memory: "6Gi", volumeSizeGib } },
			},
		},
	};
	const alienClient: AlienClient = {
		...deploymentsAlienClient({ byId: deployment, byGroup: deployment }),
		updateDeploymentCompute: async (params) => {
			updates.push(params);
		},
	};
	return { alienClient, updates };
};

describe("growing an Atom's volume on alien", () => {
	test("sends the Atom's whole compute, its machine and container unchanged, with the bigger volume", async () => {
		const { alienClient, updates } = growingAlienClient({ volumeSizeGib: 20 });

		await createAlienAtomDeployer({ alienClient }).growVolume({
			deploymentGroupId: "dg_1",
			machine: DEFAULT_BYOC_CACHE_MACHINE,
			volumeSizeGib: 50,
		});

		expect(updates).toHaveLength(1);
		expect(updates[0]?.pools).toEqual({
			stateful: { machine: "c8g.xlarge", machines: 2 },
		});
		expect(updates[0]?.containers).toEqual({
			atom: { cpu: 3, memory: "6Gi", volumeSizeGib: 50 },
		});
	});

	test("refuses a size below the one the deployment already selects, before asking alien", async () => {
		const { alienClient, updates } = growingAlienClient({ volumeSizeGib: 100 });

		const grow = createAlienAtomDeployer({ alienClient }).growVolume({
			deploymentGroupId: "dg_1",
			machine: DEFAULT_BYOC_CACHE_MACHINE,
			volumeSizeGib: 50,
		});

		await expect(grow).rejects.toThrow("can only grow");
		expect(updates).toEqual([]);
	});

	test("a deployment on the release's default volume can grow past it", async () => {
		const { alienClient, updates } = growingAlienClient({
			volumeSizeGib: null,
		});

		await createAlienAtomDeployer({ alienClient }).growVolume({
			deploymentGroupId: "dg_1",
			machine: DEFAULT_BYOC_CACHE_MACHINE,
			volumeSizeGib: 50,
		});

		expect(updates[0]?.containers?.atom?.volumeSizeGib).toBe(50);
	});

	test("a group with no running deployment has nothing to grow", async () => {
		const alienClient = deploymentsAlienClient({ byId: null, byGroup: null });

		const grow = createAlienAtomDeployer({ alienClient }).growVolume({
			deploymentGroupId: "dg_1",
			machine: DEFAULT_BYOC_CACHE_MACHINE,
			volumeSizeGib: 50,
		});

		await expect(grow).rejects.toThrow("not running");
	});
});

describe("an Atom's latest update on alien", () => {
	const withUpdate = (latest: Record<string, unknown>): AlienDeployment => ({
		...deploymentIn("running"),
		updateState: { active: null, next: null, latest },
	});
	const findWith = (deployment: AlienDeployment) =>
		createAlienAtomDeployer({
			alienClient: deploymentsAlienClient({
				byId: deployment,
				byGroup: deployment,
			}),
		}).find({ deploymentGroupId: "dg_1", deploymentId: "dep_1" });

	test("a grow alien is applying reads as applying, with when it was asked for", async () => {
		const found = await findWith(
			withUpdate({
				id: "duop_1",
				status: "applying",
				requestedAt: "2026-10-16T12:00:00Z",
				completedAt: null,
			}),
		);
		expect(found?.update).toEqual({
			status: "applying",
			requested_at: Date.parse("2026-10-16T12:00:00Z"),
			completed_at: null,
			error: null,
		});
	});

	test("a queued grow reads as requested, and a superseded one as succeeded", async () => {
		const queued = await findWith(
			withUpdate({
				id: "duop_1",
				status: "queued",
				requestedAt: "2026-10-16T12:00:00Z",
			}),
		);
		const superseded = await findWith(
			withUpdate({
				id: "duop_1",
				status: "superseded",
				requestedAt: "2026-10-16T12:00:00Z",
				completedAt: "2026-10-16T12:02:00Z",
			}),
		);
		expect(queued?.update?.status).toBe("requested");
		expect(superseded?.update?.status).toBe("succeeded");
	});

	test("a failed grow carries alien's reason", async () => {
		const found = await findWith(
			withUpdate({
				id: "duop_1",
				status: "failed",
				requestedAt: "2026-10-16T12:00:00Z",
				completedAt: "2026-10-16T12:01:00Z",
				actionRequired: "Volume modification rate limit reached",
			}),
		);
		expect(found?.update).toMatchObject({
			status: "failed",
			error: "Volume modification rate limit reached",
		});
	});

	test("a release or redeploy is not a grow, so it reads as no update", async () => {
		const update = (reasons: string[]) =>
			findWith(
				withUpdate({
					id: "duop_1",
					status: "applying",
					reasons,
					requestedAt: "2026-10-16T12:00:00Z",
				}),
			);
		expect((await update(["release"]))?.update).toBeNull();
		expect((await update(["configuration", "redeploy"]))?.update).toBeNull();
		expect((await update(["configuration"]))?.update?.status).toBe("applying");
	});

	test("no update state reads as no update", async () => {
		expect((await findWith(deploymentIn("running")))?.update).toBeNull();
	});
});
