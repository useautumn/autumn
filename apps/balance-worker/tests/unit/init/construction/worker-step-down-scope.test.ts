import { describe, expect, test } from "bun:test";
import { stepDownPermitScopeOf } from "../../../../src/init/construction/createWorkerStepDown.js";

describe("step-down permit scope", () => {
	test("each deploy of a fleet counts its own step-downs", () => {
		const first = stepDownPermitScopeOf({
			deployment: "prod",
			fleetId: "fleet-a",
			imageSha: "sha-1",
		});
		const redeployed = stepDownPermitScopeOf({
			deployment: "prod",
			fleetId: "fleet-a",
			imageSha: "sha-2",
		});
		const otherFleet = stepDownPermitScopeOf({
			deployment: "prod",
			fleetId: "fleet-b",
			imageSha: "sha-1",
		});
		expect(new Set([first, redeployed, otherFleet]).size).toBe(3);
	});

	test("a build without a known image still gets a scope of its own fleet", () => {
		expect(
			stepDownPermitScopeOf({
				deployment: "prod",
				fleetId: "fleet-a",
				imageSha: null,
			}),
		).toBe("prod/fleet-a/unversioned");
	});
});
