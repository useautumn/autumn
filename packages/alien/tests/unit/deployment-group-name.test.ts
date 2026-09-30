import { describe, expect, test } from "bun:test";
import { toDeploymentGroupName } from "../../src/setup/deploymentGroupName.js";

describe("alien deployment group names", () => {
	test("org slug and env become lowercase, hyphen-separated", () => {
		expect(toDeploymentGroupName({ label: "Acme_Corp-sandbox" })).toBe(
			"acme-corp-sandbox",
		);
	});

	test("runs of other characters collapse to one hyphen, none at the edges", () => {
		expect(toDeploymentGroupName({ label: "__org..123__live" })).toBe(
			"org-123-live",
		);
	});

	test("a name that reads like a group id is prefixed", () => {
		expect(toDeploymentGroupName({ label: "dg_team-live" })).toBe(
			"group-dg-team-live",
		);
	});
});
