import { describe, expect, test } from "bun:test";
import type { PlanUpdatePreview } from "@autumn/shared";
import { buildMigrateTargets } from "@/views/products/plan/versioning/buildMigrateTargets";

const itemChange = {
	feature_id: "messages",
	action: "updated",
} as PlanUpdatePreview["item_changes"][number];

const licenseChange = (licensePlanId: string) =>
	({
		license_plan_id: licensePlanId,
		plan_changes: { item_changes: [itemChange] },
	}) as PlanUpdatePreview["license_changes"][number];

const parent = ({
	planId = "pro",
	licensePlanIds = ["dev-seat"],
}: {
	planId?: string;
	licensePlanIds?: string[];
} = {}) =>
	({
		plan_id: planId,
		name: "Pro",
		version: 1,
		has_customers: true,
		customer_count: 4,
		conflicts: [],
		item_changes: [],
		license_changes: licensePlanIds.map(licenseChange),
	}) as unknown as PlanUpdatePreview["license_parents"][number];

const preview = ({
	licenseParents,
}: {
	licenseParents: PlanUpdatePreview["license_parents"];
}) =>
	({
		plan_id: "dev-seat",
		has_customers: true,
		customer_count: 0,
		item_changes: [],
		license_changes: [],
		previous_attributes: {},
		variants: [],
		other_versions: [],
		license_parents: licenseParents,
	}) as unknown as PlanUpdatePreview;

const buildParentTargets = (
	licenseParents: PlanUpdatePreview["license_parents"],
) =>
	buildMigrateTargets({
		preview: preview({ licenseParents }),
		selectedVariantIds: [],
		selectedLicenseParentIds: licenseParents.map(
			(entry) => `${entry.plan_id}@${entry.version}`,
		),
		versionChoice: "update",
		currentVersion: 1,
		baseName: "Dev Seat",
	}).filter((target) => target.role === "license_parent");

describe("buildMigrateTargets license parents", () => {
	// A parent's own items never change; the whole diff arrives on
	// license_changes, so dropping it renders the card as "No changes".
	test("carries the parent's license changes onto the row", () => {
		const [target] = buildParentTargets([parent()]);

		expect(target.rows[0].licenseChanges).toHaveLength(1);
		expect(target.rows[0].licenseChanges[0].licensePlanId).toBe("dev-seat");
		expect(target.rows[0].licenseChanges[0].itemChanges).toHaveLength(1);
	});

	test("keeps every license a parent links, not just the first", () => {
		const [target] = buildParentTargets([
			parent({ licensePlanIds: ["dev-seat", "admin-seat"] }),
		]);

		expect(
			target.rows[0].licenseChanges.map((change) => change.licensePlanId),
		).toEqual(["dev-seat", "admin-seat"]);
	});
});
