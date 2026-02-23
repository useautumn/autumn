import type { TestGroup } from "../../types";

export const billingV1: TestGroup = {
	name: "billing-v1",
	description: "V1 legacy attach tests",
	tier: "domain",
	paths: ["legacy/attach"],
};
