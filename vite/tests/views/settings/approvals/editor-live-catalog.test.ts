/** Contract: rules are live, so the editor's plan and feature options come from the live catalog. */

import { describe, expect, mock, test } from "bun:test";

mock.module("@/views/settings/sections/approvals/useApprovalsCatalog", () => ({
	useApprovalsCatalog: () => ({
		products: [{ id: "enterprise", name: "Enterprise" }],
		features: [{ id: "seats", name: "Seats" }],
	}),
}));

const { OPTION_HOOKS } = await import(
	"@/views/settings/sections/approvals/editor/values/useValueOptions"
);

describe("editor live catalog", () => {
	test("plans and features are offered from the live catalog", () => {
		expect(OPTION_HOOKS.catalog_plan()).toEqual([
			{ value: "enterprise", label: "Enterprise" },
		]);
		expect(OPTION_HOOKS.feature()).toEqual([
			{ value: "seats", label: "Seats" },
		]);
	});
});
