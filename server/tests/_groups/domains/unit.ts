import type { TestGroup } from "../types";

export const unit: TestGroup = {
	name: "unit",
	description:
		"Unit tests (server/tests/unit); twd runs them only when selected by this group or by path",
	tier: "domain",
	paths: ["unit"],
};
