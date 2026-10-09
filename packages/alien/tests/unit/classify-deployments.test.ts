import { describe, expect, test } from "bun:test";
import {
	hasDeploymentFailed,
	isDeploymentAwaitingSetup,
	isDeploymentAwaitingTeardown,
	isDeploymentBeingDeleted,
	isDeploymentInSetup,
	isDeploymentRemoving,
	isDeploymentRunning,
} from "../../src/alien.js";

const deploymentIn = (status: string) => ({ id: "dep_1", status });

describe("where a deployment is in its lifecycle", () => {
	test("pending waits on the customer's setup; later phases do not", () => {
		expect(
			isDeploymentAwaitingSetup({ deployment: deploymentIn("pending") }),
		).toBe(true);
		expect(
			isDeploymentAwaitingSetup({ deployment: deploymentIn("initial-setup") }),
		).toBe(false);
	});

	test("only running is running", () => {
		expect(isDeploymentRunning({ deployment: deploymentIn("running") })).toBe(
			true,
		);
		expect(
			isDeploymentRunning({ deployment: deploymentIn("provisioning") }),
		).toBe(false);
	});

	test("every failed phase and the stuck states have failed", () => {
		for (const status of [
			"preflights-failed",
			"initial-setup-failed",
			"provisioning-failed",
			"error",
			"teardown-required",
		])
			expect(hasDeploymentFailed({ deployment: deploymentIn(status) })).toBe(
				true,
			);
	});

	test("in-flight phases have not failed", () => {
		for (const status of [
			"pending",
			"initial-setup",
			"provisioning",
			"updating",
		])
			expect(hasDeploymentFailed({ deployment: deploymentIn(status) })).toBe(
				false,
			);
	});

	test("a requested delete is being deleted until it is gone", () => {
		for (const status of ["delete-pending", "deleting", "deleted"])
			expect(
				isDeploymentBeingDeleted({ deployment: deploymentIn(status) }),
			).toBe(true);
		expect(
			isDeploymentBeingDeleted({ deployment: deploymentIn("pending") }),
		).toBe(false);
	});

	test("setup lasts until the stack is in place, failures included", () => {
		for (const status of [
			"pending",
			"preflights-failed",
			"initial-setup",
			"initial-setup-failed",
		])
			expect(isDeploymentInSetup({ deployment: deploymentIn(status) })).toBe(
				true,
			);
		expect(
			isDeploymentInSetup({ deployment: deploymentIn("provisioning") }),
		).toBe(false);
	});

	test("a delete removes what runs, then waits on the customer's stack", () => {
		for (const status of ["delete-pending", "deleting", "delete-failed"])
			expect(isDeploymentRemoving({ deployment: deploymentIn(status) })).toBe(
				true,
			);
		for (const status of ["teardown-required", "teardown-failed"])
			expect(
				isDeploymentAwaitingTeardown({ deployment: deploymentIn(status) }),
			).toBe(true);
		expect(
			isDeploymentRemoving({ deployment: deploymentIn("teardown-required") }),
		).toBe(false);
	});
});
