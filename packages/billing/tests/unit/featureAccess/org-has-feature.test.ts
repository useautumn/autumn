import { describe, expect, test } from "bun:test";
import { orgHasFeature } from "../../../src/featureAccess/actions/orgHasFeature";
import { BillingFeatureId } from "../../../src/featureAccess/billingFeatureIds";
import type { FeatureAccessContext } from "../../../src/featureAccess/types/featureAccessContext";

const ctxWith = ({
	check,
}: {
	check: () => Promise<{ allowed: boolean }>;
}): FeatureAccessContext => ({
	autumn: { check },
	logger: { warn: () => {} },
});

describe("orgHasFeature", () => {
	test("answers with Autumn's check for the org", async () => {
		const calls: unknown[] = [];
		const ctx: FeatureAccessContext = {
			autumn: {
				check: async (params) => {
					calls.push(params);
					return { allowed: false };
				},
			},
			logger: { warn: () => {} },
		};

		const allowed = await orgHasFeature({
			ctx,
			orgId: "org_1",
			featureId: BillingFeatureId.Atoms,
		});

		expect(allowed).toBe(false);
		expect(calls).toEqual([{ customerId: "org_1", featureId: "atoms" }]);
	});

	test("fails open when Autumn is unreachable", async () => {
		const allowed = await orgHasFeature({
			ctx: ctxWith({
				check: async () => {
					throw new Error("unreachable");
				},
			}),
			orgId: "org_1",
			featureId: BillingFeatureId.Atoms,
		});
		expect(allowed).toBe(true);
	});
});
