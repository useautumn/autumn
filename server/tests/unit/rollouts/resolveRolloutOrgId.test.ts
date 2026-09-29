import { describe, expect, test } from "bun:test";
import { resolveRolloutOrgId } from "@/internal/misc/rollouts/resolveRolloutOrgId.js";
import type { RolloutConfig } from "@/internal/misc/rollouts/rolloutSchemas.js";
import {
	ACTIVE_ROLLOUT_ID,
	isRolloutEnabled,
} from "@/internal/misc/rollouts/rolloutUtils.js";

const MASTER_ORG_ID = "org_master";

const sandbox = {
	id: "org_sandbox",
	is_sandbox: true,
	created_by: MASTER_ORG_ID,
};
const platformSubOrg = {
	id: "org_platform_sub",
	is_sandbox: false,
	created_by: MASTER_ORG_ID,
};
const standaloneOrg = {
	id: "org_standalone",
	is_sandbox: false,
	created_by: null,
};

/** Global at 0%, the master org overridden to 100%. */
const masterOnWorker: RolloutConfig = {
	rollouts: {
		[ACTIVE_ROLLOUT_ID]: {
			percent: 0,
			previousPercent: 0,
			changedAt: 0,
			decreases: [],
			orgs: {
				[MASTER_ORG_ID]: {
					percent: 100,
					previousPercent: 100,
					changedAt: 0,
					decreases: [],
				},
			},
			customers: {},
		},
	},
};

const routesToWorker = (
	org: Parameters<typeof resolveRolloutOrgId>[0]["org"],
) =>
	isRolloutEnabled({
		rolloutId: ACTIVE_ROLLOUT_ID,
		orgId: resolveRolloutOrgId({ org }),
		customerId: "cus_1",
		now: 1,
		config: masterOnWorker,
	});

describe("resolveRolloutOrgId", () => {
	test("a sandbox follows its master org's rollout override", () => {
		expect(resolveRolloutOrgId({ org: sandbox })).toBe(MASTER_ORG_ID);
		expect(routesToWorker(sandbox)).toBe(true);
	});

	test("a platform sub-org keeps its own id and follows the global percent", () => {
		expect(resolveRolloutOrgId({ org: platformSubOrg })).toBe(
			platformSubOrg.id,
		);
		expect(routesToWorker(platformSubOrg)).toBe(false);
	});

	test("a standalone org keeps its own id", () => {
		expect(resolveRolloutOrgId({ org: standaloneOrg })).toBe(standaloneOrg.id);
		expect(routesToWorker(standaloneOrg)).toBe(false);
	});

	test("a sandbox with no master falls back to its own id", () => {
		const orphan = { ...sandbox, created_by: null };
		expect(resolveRolloutOrgId({ org: orphan })).toBe(sandbox.id);
	});
});
