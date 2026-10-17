import { describe, expect, test } from "bun:test";
import type { Feature } from "@autumn/shared";
import { legacyCatalogParamsToApprovalChecks } from "@/internal/approvals/facts/catalog/legacyCatalogParamsToApprovalChecks";
import { planUpdateToEditedPlanIds } from "@/internal/approvals/facts/catalog/planUpdateToEditedPlanIds";
import { updateCatalogPlanToApprovalChecks } from "@/internal/approvals/facts/catalog/updateCatalogPlanToApprovalChecks";
import type { UpdateCatalogPlan } from "@/internal/catalogV2/actions/updateCatalog/types/updateCatalogPlan";

const feature = (id: string) => ({ id }) as Feature;

const upsert = ({
	planId,
	op,
	source = "direct",
	minted = false,
}: {
	planId: string;
	op: "create" | "update" | "none";
	source?: string;
	minted?: boolean;
}) => ({
	row: {
		planId,
		op,
		source,
		baseFullProduct: minted ? { id: planId } : null,
	},
});

describe("catalog approval checks", () => {
	test("a computed catalog update maps each plan and feature to its verb, renames on both ids", () => {
		const plan = {
			upsertProducts: [
				upsert({ planId: "new_plan", op: "create" }),
				upsert({ planId: "pro", op: "update" }),
				upsert({ planId: "pro", op: "create", minted: true }),
				upsert({ planId: "stated", op: "none" }),
				upsert({ planId: "untouched", op: "none", source: "all_versions" }),
			],
			renamePlans: [{ planId: "old", toId: "renamed" }],
			removePlans: [{ planId: "gone" }],
			insertFeatures: [feature("seats")],
			updateFeatures: [{ current: feature("msgs"), next: feature("messages") }],
			removeFeatures: [{ featureId: "legacy" }],
		} as unknown as UpdateCatalogPlan;

		expect(
			updateCatalogPlanToApprovalChecks({ updateCatalogPlan: plan }),
		).toEqual([
			{ action: "plans.create", planId: "new_plan" },
			{ action: "plans.update", planId: "pro" },
			{ action: "plans.update", planId: "pro" },
			{ action: "plans.update", planId: "stated" },
			{ action: "plans.update", planId: "old" },
			{ action: "plans.update", planId: "renamed" },
			{ action: "plans.delete", planId: "gone" },
			{ action: "features.create", featureId: "seats" },
			{ action: "features.update", featureId: "msgs" },
			{ action: "features.update", featureId: "messages" },
			{ action: "features.delete", featureId: "legacy" },
		]);
	});

	test("a legacy catalog update creates unknown ids, updates known ones and deletes what it replaces", () => {
		expect(
			legacyCatalogParamsToApprovalChecks({
				params: {
					plans: [{ plan_id: "pro" }, { plan_id: "new_plan" }],
					features: [{ feature_id: "msgs" }, { feature_id: "seats" }],
				},
				existingPlanIds: ["pro"],
				existingFeatureIds: ["msgs"],
				removedPlanIds: ["gone"],
				removedFeatureIds: ["legacy"],
			}),
		).toEqual([
			{ action: "plans.update", planId: "pro" },
			{ action: "plans.create", planId: "new_plan" },
			{ action: "plans.delete", planId: "gone" },
			{ action: "features.update", featureId: "msgs" },
			{ action: "features.create", featureId: "seats" },
			{ action: "features.delete", featureId: "legacy" },
		]);
	});

	test("a plan update writes itself, its rename, its variants and its license parents", () => {
		expect(
			planUpdateToEditedPlanIds({
				params: {
					plan_id: "pro",
					new_plan_id: "pro_v2",
					update_variant_ids: ["pro_eu"],
					variants: [{ variant_plan_id: "pro_us" }],
					update_license_parents: [{ plan_id: "team" }],
				},
			}),
		).toEqual(["pro", "pro_v2", "pro_eu", "pro_us", "team"]);
	});
});
