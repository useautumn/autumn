import { describe, expect, test } from "bun:test";
import { orgHasFeature } from "../../../src/featureAccess/actions/orgHasFeature";
import { BillingFeatureId } from "../../../src/featureAccess/billingFeatureIds";
import type { FeatureAccessContext } from "../../../src/featureAccess/types/featureAccessContext";

type Check = FeatureAccessContext["autumn"]["check"];

const unused: Check = async () => {
	throw new Error("wrong check path");
};

const ctxWith = ({
	check = unused,
	edgeCheck = unused,
	infos = [],
}: {
	check?: Check;
	edgeCheck?: Check;
	infos?: unknown[];
}): Pick<FeatureAccessContext, "autumn" | "logger"> => ({
	autumn: { check, edge: { check: edgeCheck } },
	logger: { info: (_message, data) => infos.push(data), warn: () => {} },
});

describe("orgHasFeature", () => {
	test("answers with Autumn's check for the org", async () => {
		const calls: unknown[] = [];
		const infos: unknown[] = [];

		const allowed = await orgHasFeature({
			ctx: ctxWith({
				check: async (params) => {
					calls.push(params);
					return { allowed: false };
				},
				infos,
			}),
			orgId: "org_1",
			featureId: BillingFeatureId.Atoms,
		});

		expect(allowed).toBe(false);
		expect(calls).toEqual([{ customerId: "org_1", featureId: "atoms" }]);
		expect(infos).toEqual([
			{
				type: "billing_check",
				data: {
					path: "api",
					featureId: "atoms",
					allowed: false,
					durationMs: expect.any(Number),
				},
			},
		]);
	});

	test("with useEdge, asks the edge instead of the API", async () => {
		const calls: unknown[] = [];
		const infos: unknown[] = [];

		const allowed = await orgHasFeature({
			ctx: ctxWith({
				edgeCheck: async (params) => {
					calls.push(params);
					return { allowed: true };
				},
				infos,
			}),
			orgId: "org_1",
			featureId: BillingFeatureId.Atoms,
			useEdge: true,
		});

		expect(allowed).toBe(true);
		expect(calls).toEqual([{ customerId: "org_1", featureId: "atoms" }]);
		expect(infos).toEqual([
			{
				type: "billing_check",
				data: expect.objectContaining({ path: "edge", allowed: true }),
			},
		]);
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
