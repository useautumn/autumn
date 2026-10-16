import { describe, expect, test } from "bun:test";
import type { AlienClient } from "@autumn/alien";
import {
	AppEnv,
	type ByocCacheDeployment,
	ByocCacheStatus,
} from "@autumn/shared";
import { refreshAtomRecord } from "@/internal/byoc/atomRecords/refreshAtomRecord.js";
import { tearDownAtomRecord } from "@/internal/byoc/atomRecords/tearDownAtomRecord.js";
import type { AtomContext } from "@/internal/byoc/atomRecords/types/atomContext.js";
import { createAlienAtomDeployer } from "@/internal/byoc/deployers/createAlienAtomDeployer.js";
import type {
	AtomDeployer,
	AtomDeployment,
} from "@/internal/byoc/deployers/types/atomDeployer.js";
import { toCacheStages } from "@/internal/byoc/utils/cacheStageUtils.js";

const record = (status: ByocCacheStatus): ByocCacheDeployment => ({
	id: "atom_1",
	org_id: "org_1",
	env: AppEnv.Sandbox,
	name: null,
	deployment_group_id: "dg_1",
	deployment_id: "dep_1",
	status,
	endpoint_url: null,
	cpu: 4,
	memory: 8,
	encrypted_token: "encrypted",
	token_hash: null,
	region: null,
	network: null,
	stack_name: null,
	stages: toCacheStages({ doneStages: [], status }),
	error: null,
	first_check_at: null,
	created_at: 1,
});

const awaitingTeardown: AtomDeployment = {
	id: "dep_1",
	status: ByocCacheStatus.TeardownRequired,
	endpointUrl: null,
	machine: null,
	region: "us-east-1",
	doneStages: [],
	removedStages: [],
	error: null,
};

/** A deployer reporting `found` on every read, and an in-memory record; `calls` is the order things happened in. */
const atomContext = ({ found }: { found: AtomDeployment | null }) => {
	const calls: string[] = [];
	const deployer: AtomDeployer = {
		start: async () => ({ deploymentGroupId: "dg_1", setupUrl: null }),
		hasGroup: async () => false,
		find: async () => found,
		resize: async () => {},
		retry: async () => {},
		delete: async () => {
			calls.push("delete");
		},
		closeSetup: async () => {
			calls.push("closeSetup");
		},
	};
	const ctx: AtomContext<ByocCacheDeployment> = {
		deployer,
		storage: {
			find: async () => null,
			update: async () => {},
			forget: async () => {
				calls.push("forget");
			},
		},
	};
	return { ctx, calls };
};

describe("an Atom's setup links across its delete", () => {
	test("deleting it leaves the links open while the customer's stack is still up", async () => {
		const { ctx, calls } = atomContext({ found: awaitingTeardown });

		const remaining = await tearDownAtomRecord({
			ctx,
			record: record(ByocCacheStatus.Ready),
		});

		expect(remaining?.status).toBe(ByocCacheStatus.TeardownRequired);
		expect(calls).toEqual(["delete"]);
	});

	test("the refresh that sees the deployment gone closes the setup, then forgets the record", async () => {
		const { ctx, calls } = atomContext({ found: null });

		const remaining = await refreshAtomRecord({
			ctx,
			record: record(ByocCacheStatus.Removing),
		});

		expect(remaining).toBeNull();
		expect(calls).toEqual(["closeSetup", "forget"]);
	});

	test("a setup that failed to close keeps the record, so the next refresh tries again", async () => {
		const { ctx, calls } = atomContext({ found: null });
		ctx.deployer.closeSetup = async () => {
			throw new Error("alien 500");
		};

		await expect(
			refreshAtomRecord({ ctx, record: record(ByocCacheStatus.Removing) }),
		).rejects.toThrow("alien 500");
		expect(calls).toEqual([]);
	});
});

describe("the alien deployer's delete", () => {
	test("tears the deployment down without revoking its setup links", async () => {
		const calls: string[] = [];
		const alienClient = {
			findDeployment: async () => ({ id: "dep_1", status: "running" }),
			deleteDeployment: async () => {
				calls.push("deleteDeployment");
			},
			revokeSetupLinksOnceDeleted: async () => {
				calls.push("revokeSetupLinksOnceDeleted");
			},
		} as unknown as AlienClient;
		const deployer = createAlienAtomDeployer({ alienClient });

		await deployer.delete({ deploymentGroupId: "dg_1" });
		expect(calls).toEqual(["deleteDeployment"]);

		await deployer.closeSetup({ deploymentGroupId: "dg_1" });
		expect(calls).toEqual(["deleteDeployment", "revokeSetupLinksOnceDeleted"]);
	});
});
