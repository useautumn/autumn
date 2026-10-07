import type { TestGroup } from "../types";

/** CI runs these on every PR, so twd's other groups leave them out; name this group to run them there. */
export const unit: TestGroup = {
	name: "unit",
	description:
		"Unit tests (server/tests/unit); twd runs them only when selected by this group or by path",
	tier: "domain",
	paths: ["unit"],
};
