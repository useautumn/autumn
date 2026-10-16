import { describe, expect, test } from "bun:test";
import { deploymentToUpdate } from "../../src/alien.js";

const operation = (status: string) => ({
	id: `duop_${status}`,
	status,
	reasons: ["configuration"],
	targetReleaseId: "rel_1",
	changedKeys: [],
	requestedAt: "2026-10-16T12:00:00Z",
	completedAt: status === "succeeded" ? "2026-10-16T12:03:00Z" : null,
});

const withUpdateState = (updateState: unknown) => ({
	id: "dep_1",
	status: "updating",
	updateState,
});

describe("a deployment's current update", () => {
	test("is the one alien is applying", () => {
		const deployment = withUpdateState({
			active: operation("applying"),
			next: null,
			latest: operation("succeeded"),
		});
		expect(deploymentToUpdate({ deployment })?.status).toBe("applying");
	});

	test("is the last one alien finished when none is active", () => {
		const deployment = withUpdateState({
			active: null,
			next: null,
			latest: operation("succeeded"),
		});
		expect(deploymentToUpdate({ deployment })).toMatchObject({
			status: "succeeded",
			completedAt: "2026-10-16T12:03:00Z",
		});
	});

	test("is null when alien reports no update state", () => {
		expect(
			deploymentToUpdate({ deployment: withUpdateState(undefined) }),
		).toBeNull();
	});
});
