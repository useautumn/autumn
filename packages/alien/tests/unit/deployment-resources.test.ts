import { describe, expect, test } from "bun:test";
import {
	deploymentToErrorMessage,
	deploymentToResources,
} from "../../src/alien.js";

const provisioning = {
	id: "dep_1",
	status: "provisioning",
	stackState: {
		resources: {
			"compute-cluster": {
				config: { id: "compute-cluster", type: "compute-cluster" },
				status: "running",
				outputs: { totalMachines: 1 },
			},
			atom: {
				config: { id: "atom", type: "container" },
				status: "provisioning",
				outputs: null,
				error: { code: "CAPACITY", message: "No c7g.xlarge capacity" },
			},
		},
	},
};

describe("a deployment's resources", () => {
	test("are read with their type, status, outputs and error", () => {
		expect(deploymentToResources({ deployment: provisioning })).toEqual([
			{
				id: "compute-cluster",
				type: "compute-cluster",
				status: "running",
				outputs: { totalMachines: 1 },
				error: null,
			},
			{
				id: "atom",
				type: "container",
				status: "provisioning",
				outputs: null,
				error: "No c7g.xlarge capacity",
			},
		]);
	});

	test("are none before alien has a stack state", () => {
		expect(
			deploymentToResources({ deployment: { id: "dep_1", status: "pending" } }),
		).toEqual([]);
	});
});

describe("why a deployment stopped", () => {
	test("is its own error first", () => {
		const failed = {
			...provisioning,
			status: "provisioning-failed",
			error: { code: "QUOTA", message: "vCPU quota exceeded" },
		};
		expect(deploymentToErrorMessage({ deployment: failed })).toBe(
			"vCPU quota exceeded",
		);
	});

	test("falls back to the first resource that failed", () => {
		expect(deploymentToErrorMessage({ deployment: provisioning })).toBe(
			"No c7g.xlarge capacity",
		);
	});

	test("is null when nothing went wrong", () => {
		expect(
			deploymentToErrorMessage({
				deployment: { id: "dep_1", status: "running" },
			}),
		).toBeNull();
	});
});
