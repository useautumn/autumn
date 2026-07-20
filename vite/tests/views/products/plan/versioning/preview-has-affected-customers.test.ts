import { describe, expect, test } from "bun:test";
import type { PlanUpdatePreview } from "@autumn/shared";
import {
	previewHasLicenseParentTargets,
	previewHasVersionableTargets,
} from "@/views/products/plan/versioning/previewHasAffectedCustomers";

const buildPreview = ({
	hasCustomers = false,
	historicalHasCustomers = false,
	parentHasCustomers = false,
	versionable = false,
}: {
	hasCustomers?: boolean;
	historicalHasCustomers?: boolean;
	parentHasCustomers?: boolean;
	versionable?: boolean;
}) =>
	({
		has_customers: hasCustomers,
		other_versions: [{ has_customers: historicalHasCustomers }],
		license_parents: [
			{
				has_customers: parentHasCustomers,
				license_changes: [],
				versionable: false,
			},
		],
		variants: [],
		versionable,
	}) as PlanUpdatePreview;

describe("license parent decisions", () => {
	test("detects a parent target without adding a version choice", () => {
		const preview = buildPreview({});

		expect(previewHasLicenseParentTargets(preview)).toBe(true);
		expect(previewHasVersionableTargets(preview)).toBe(false);
	});

	test("historical customers do not make the current version versionable", () => {
		const preview = buildPreview({ historicalHasCustomers: true });

		expect(previewHasVersionableTargets(preview)).toBe(false);
	});

	test("detects when the current plan is versionable", () => {
		const preview = buildPreview({ versionable: true });

		expect(previewHasVersionableTargets(preview)).toBe(true);
	});
});
