import { describe, expect, test } from "bun:test";
import {
	allVersionsScopeLabel,
	canChooseDeleteScope,
	canDeleteThisVersion,
	DELETE_PLAN_SCOPE_LABELS,
	hasMultiplePlanVersions,
	shouldRemoveThisVersion,
} from "@/views/products/plan/components/deletePlanScope";

describe("delete plan scope", () => {
	test("this version is deletable only when preview says it will not archive", () => {
		expect(
			canDeleteThisVersion({
				hasPreview: true,
				previewFailed: false,
				willArchive: false,
			}),
		).toBe(true);
		expect(
			canDeleteThisVersion({
				hasPreview: true,
				previewFailed: false,
				willArchive: true,
			}),
		).toBe(false);
		expect(
			canDeleteThisVersion({
				hasPreview: false,
				previewFailed: false,
				willArchive: false,
			}),
		).toBe(false);
		expect(
			canDeleteThisVersion({
				hasPreview: true,
				previewFailed: true,
				willArchive: false,
			}),
		).toBe(false);
	});

	test("an empty draft still counts as multiple versions when the list row is active v1", () => {
		expect(
			hasMultiplePlanVersions({
				viewedVersion: 2,
				listedVersion: 1,
				numVersions: 1,
			}),
		).toBe(true);
		expect(
			hasMultiplePlanVersions({
				viewedVersion: 1,
				listedVersion: 1,
				numVersions: 1,
			}),
		).toBe(false);
	});

	test("scope choice is offered when this version can be deleted and archive-all differs", () => {
		expect(
			canChooseDeleteScope({
				thisVersionDeletable: true,
				hasMultipleVersions: false,
				willArchiveAll: true,
			}),
		).toBe(true);
		expect(
			canChooseDeleteScope({
				thisVersionDeletable: true,
				hasMultipleVersions: true,
				willArchiveAll: false,
			}),
		).toBe(true);
		expect(
			canChooseDeleteScope({
				thisVersionDeletable: false,
				hasMultipleVersions: true,
				willArchiveAll: true,
			}),
		).toBe(false);
		expect(
			canChooseDeleteScope({
				thisVersionDeletable: true,
				hasMultipleVersions: false,
				willArchiveAll: false,
			}),
		).toBe(false);
	});

	test("a deletable version is removed on its own even if the selector is hidden", () => {
		expect(
			shouldRemoveThisVersion({
				thisVersionDeletable: true,
				scope: "version",
			}),
		).toBe(true);
		expect(
			shouldRemoveThisVersion({
				thisVersionDeletable: false,
				scope: "version",
			}),
		).toBe(false);
		expect(
			shouldRemoveThisVersion({
				thisVersionDeletable: true,
				scope: "all",
			}),
		).toBe(false);
	});

	test("labels distinguish delete this version from archive all", () => {
		expect(DELETE_PLAN_SCOPE_LABELS.version).toBe("Delete this version");
		expect(allVersionsScopeLabel({ willArchiveAll: true })).toBe(
			"Archive all versions",
		);
		expect(allVersionsScopeLabel({ willArchiveAll: false })).toBe(
			"All versions",
		);
	});
});
