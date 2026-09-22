import { describe, expect, test } from "bun:test";
import { excludeRegularOrgsFromPlatformResults } from "../../../src/views/command-bar/commandUtils";

describe("excludeRegularOrgsFromPlatformResults", () => {
	test("keeps regular organizations out of platform results", () => {
		const regularOrg = { id: "regular", name: "Regular" };
		const platformOrg = { id: "platform", name: "Platform" };

		expect(
			excludeRegularOrgsFromPlatformResults({
				regularOrgs: [regularOrg],
				platformOrgs: [regularOrg, platformOrg],
			}),
		).toEqual([platformOrg]);
	});

	test("preserves platform organizations when responses do not overlap", () => {
		const platformOrg = { id: "platform", name: "Platform" };

		expect(
			excludeRegularOrgsFromPlatformResults({
				regularOrgs: [{ id: "regular", name: "Regular" }],
				platformOrgs: [platformOrg],
			}),
		).toEqual([platformOrg]);
	});
});
