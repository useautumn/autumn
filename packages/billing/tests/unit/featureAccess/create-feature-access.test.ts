import { describe, expect, test } from "bun:test";
import { BillingFeatureId } from "../../../src/featureAccess/billingFeatureIds";
import { createFeatureAccess } from "../../../src/featureAccess/createFeatureAccess";
import { ATOMS_LIMIT } from "../../../src/featureAccess/featureLimits";
import type { FeatureAccessContext } from "../../../src/featureAccess/types/featureAccessContext";

const PRODUCTION = { NODE_ENV: "production", AWS_REGION: "us-east-2" };
const STAGING = {
	NODE_ENV: "production",
	STAGING_ENVIRONMENT: "true",
	AWS_REGION: "us-east-1",
};
const DEV = { NODE_ENV: "development" };

/** A billing Autumn whose check answers `allowed` (or throws), recording each call. */
const accessWith = ({
	allowed = true,
	throws = false,
	runtimeEnv = PRODUCTION,
	overrides,
}: {
	allowed?: boolean;
	throws?: boolean;
	runtimeEnv?: Record<string, string>;
	overrides?: FeatureAccessContext["overrides"];
} = {}) => {
	const checks: unknown[] = [];
	const check = async (params: unknown) => {
		checks.push(params);
		if (throws) throw new Error("autumn unreachable");
		return { allowed };
	};
	const featureAccess = createFeatureAccess({
		ctx: {
			autumn: { check, edge: { check } },
			logger: { info: () => {}, warn: () => {} },
			runtimeEnv,
			overrides,
			useEdge: false,
		},
	});
	return { featureAccess, checks };
};

const countOf = (count: number) => () => Promise.resolve(count);

describe("createFeatureAccess", () => {
	test("in production, the org's plan decides", async () => {
		const onPlan = accessWith({ allowed: true });
		const offPlan = accessWith({ allowed: false });
		const params = { orgId: "org_1", featureId: BillingFeatureId.Atoms };

		expect(await onPlan.featureAccess.hasFeature(params)).toBe(true);
		expect(await offPlan.featureAccess.hasFeature(params)).toBe(false);
		expect(offPlan.checks).toEqual([
			{ customerId: "org_1", featureId: "atoms" },
		]);
	});

	test("staging and dev skip the plan check, without calling Autumn", async () => {
		for (const runtimeEnv of [STAGING, DEV]) {
			const { featureAccess, checks } = accessWith({
				allowed: false,
				runtimeEnv,
			});
			expect(
				await featureAccess.hasFeature({
					orgId: "org_1",
					featureId: BillingFeatureId.Atoms,
				}),
			).toBe(true);
			expect(checks).toEqual([]);
		}
	});

	test("an unreachable Autumn allows", async () => {
		const { featureAccess } = accessWith({ throws: true });
		expect(
			await featureAccess.hasFeature({
				orgId: "org_1",
				featureId: BillingFeatureId.Atoms,
			}),
		).toBe(true);
	});

	test("a test override wins over the plan and the environment", async () => {
		const { featureAccess, checks } = accessWith({
			allowed: true,
			runtimeEnv: DEV,
			overrides: { atoms: false },
		});
		expect(
			await featureAccess.hasFeature({
				orgId: "org_1",
				featureId: BillingFeatureId.Atoms,
			}),
		).toBe(false);
		expect(checks).toEqual([]);
	});

	test("atoms: under the limit on the plan, the org can create another", async () => {
		const { featureAccess } = accessWith({ allowed: true });
		expect(
			await featureAccess.atoms({
				orgId: "org_1",
				countActive: countOf(ATOMS_LIMIT - 1),
			}),
		).toEqual({
			included: true,
			limit: ATOMS_LIMIT,
			used: ATOMS_LIMIT - 1,
			canCreate: true,
			reason: null,
		});
	});

	test("atoms: at the limit, creating is refused as limit_reached", async () => {
		const { featureAccess } = accessWith({ allowed: true });
		expect(
			await featureAccess.atoms({
				orgId: "org_1",
				countActive: countOf(ATOMS_LIMIT),
			}),
		).toEqual({
			included: true,
			limit: ATOMS_LIMIT,
			used: ATOMS_LIMIT,
			canCreate: false,
			reason: "limit_reached",
		});
	});

	test("atoms: off the plan, creating is refused as not_on_plan, whatever the count", async () => {
		const { featureAccess } = accessWith({ allowed: false });
		expect(
			await featureAccess.atoms({ orgId: "org_1", countActive: countOf(0) }),
		).toEqual({
			included: false,
			limit: ATOMS_LIMIT,
			used: 0,
			canCreate: false,
			reason: "not_on_plan",
		});
	});

	test("atoms: staging keeps the limit while skipping the plan", async () => {
		const { featureAccess } = accessWith({
			allowed: false,
			runtimeEnv: STAGING,
		});
		expect(
			await featureAccess.atoms({
				orgId: "org_1",
				countActive: countOf(ATOMS_LIMIT),
			}),
		).toMatchObject({
			included: true,
			canCreate: false,
			reason: "limit_reached",
		});
	});
});
