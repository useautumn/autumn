import type { TestGroup } from "../types";

export const coreLicensesBilling: TestGroup = {
	name: "core-licenses-billing",
	description:
		"Core license assignment, attach, checkout, transition, and update tests",
	tier: "core",
	paths: ["integration/licenses/billing"],
};
