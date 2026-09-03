import { describe, expect, test } from "bun:test";
import { collectSurplusUnusedAssignmentIds } from "@/internal/licenses/actions/reconcile/collectSurplusUnusedAssignmentIds";
import { computeSurplusUnusedLicenseAssignments } from "@/internal/licenses/actions/reconcile/computeSurplusUnusedLicenseAssignments";

describe("computeSurplusUnusedLicenseAssignments", () => {
	const unused = [{ id: "oldest" }, { id: "newest" }];

	test("remaining 0 expires every unused seat", () => {
		expect(
			computeSurplusUnusedLicenseAssignments({
				unusedAssignments: unused,
				remaining: 0,
			}).map((assignment) => assignment.id),
		).toEqual(["oldest", "newest"]);
	});

	test("remaining 1 of 2 unused keeps the newest", () => {
		expect(
			computeSurplusUnusedLicenseAssignments({
				unusedAssignments: unused,
				remaining: 1,
			}).map((assignment) => assignment.id),
		).toEqual(["oldest"]);
	});

	test("remaining below 0 expires every unused seat", () => {
		expect(
			computeSurplusUnusedLicenseAssignments({
				unusedAssignments: unused,
				remaining: -1,
			}).map((assignment) => assignment.id),
		).toEqual(["oldest", "newest"]);
	});

	test("unused within remaining expires nothing", () => {
		expect(
			computeSurplusUnusedLicenseAssignments({
				unusedAssignments: unused,
				remaining: 2,
			}),
		).toEqual([]);
	});
});

describe("collectSurplusUnusedAssignmentIds", () => {
	test("expires unused beyond remaining on the matching link", () => {
		expect(
			collectSurplusUnusedAssignmentIds({
				unusedAssignments: [
					{ id: "a", customer_license_link_id: "link-a" },
					{ id: "b", customer_license_link_id: "link-a" },
					{ id: "c", customer_license_link_id: "link-b" },
				],
				customerLicenses: [
					{ link_id: "link-a", remaining: 1 },
					{ link_id: "link-b", remaining: 1 },
				],
			}),
		).toEqual(["a"]);
	});
});
