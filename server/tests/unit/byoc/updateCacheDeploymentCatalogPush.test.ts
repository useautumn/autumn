import { beforeEach, describe, expect, test } from "bun:test";
import {
	AppEnv,
	type ByocCacheDeployment,
	ByocCacheStatus,
} from "@autumn/shared";
import type { AutumnContext } from "@/honoUtils/HonoEnv.js";
import { toCacheStages } from "@/internal/byoc/utils/cacheStageUtils.js";
import { mockModuleWithRestore } from "../utils/mockModuleWithRestore.js";

let published: { orgId: string; env: AppEnv }[] = [];

await mockModuleWithRestore(
	"@/internal/balanceWorker/catalog/publishCatalogInvalidation.js",
	() => ({
		publishCatalogInvalidation: async ({
			orgId,
			env,
		}: {
			orgId: string;
			env: AppEnv;
		}) => {
			published.push({ orgId, env });
		},
	}),
);
await mockModuleWithRestore(
	"@/internal/orgs/orgUtils/clearOrgCache.js",
	() => ({
		clearOrgCache: async () => {},
	}),
);

const { updateCacheDeployment } = await import(
	"@/internal/byoc/repos/updateCacheDeployment.js"
);

const ATOM_URL = "https://atom.example.com";

const atomIn = ({
	status,
	deploymentId = "dep_1",
	endpointUrl = ATOM_URL,
}: {
	status: ByocCacheDeployment["status"];
	deploymentId?: string | null;
	endpointUrl?: string | null;
}): ByocCacheDeployment => ({
	id: "atom_1",
	org_id: "org_1",
	env: AppEnv.Sandbox,
	deployment_group_id: "dg_1",
	deployment_id: deploymentId,
	status,
	endpoint_url: endpointUrl,
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
	first_check_seen_at: null,
	created_at: 1,
});

/** A db whose conditional update lands on `landed` rows. */
const ctxWith = ({ landed = 1 }: { landed?: number } = {}) => {
	const rows = Array.from({ length: landed }, () => ({ id: "atom_1" }));
	const where = () =>
		Object.assign(Promise.resolve(rows), { returning: async () => rows });
	return {
		org: { id: "org_1" },
		env: AppEnv.Sandbox,
		logger: { error() {}, warn() {}, info() {} },
		db: { update: () => ({ set: () => ({ where }) }) },
	} as unknown as AutumnContext;
};

const update = ({
	from,
	to,
	landed,
}: {
	from: ByocCacheDeployment;
	to: ByocCacheDeployment;
	landed?: number;
}) => updateCacheDeployment({ ctx: ctxWith({ landed }), from, to });

beforeEach(() => {
	published = [];
});

describe("an Atom becoming a push target is sent its org's catalog", () => {
	test("a deploy that turns ready publishes one catalog invalidation for its org and env", async () => {
		await update({
			from: atomIn({
				status: ByocCacheStatus.Provisioning,
				deploymentId: null,
				endpointUrl: null,
			}),
			to: atomIn({ status: ByocCacheStatus.Ready }),
		});
		expect(published).toEqual([{ orgId: "org_1", env: AppEnv.Sandbox }]);
	});

	test("a ready Atom that moves to a new endpoint is a new target", async () => {
		await update({
			from: atomIn({ status: ByocCacheStatus.Ready }),
			to: atomIn({
				status: ByocCacheStatus.Ready,
				endpointUrl: "https://atom-2.example.com",
			}),
		});
		expect(published).toHaveLength(1);
	});

	test("no publish when the route herald pushes to is unchanged, is going away, or the write lost a race", async () => {
		const ready = atomIn({ status: ByocCacheStatus.Ready });
		await update({ from: ready, to: { ...ready, first_check_at: 5 } });
		await update({
			from: ready,
			to: atomIn({ status: ByocCacheStatus.Removing }),
		});
		await update({
			from: atomIn({
				status: ByocCacheStatus.Provisioning,
				deploymentId: null,
			}),
			to: ready,
			landed: 0,
		});
		expect(published).toEqual([]);
	});
});
