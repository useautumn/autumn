import { describe, expect, test } from "bun:test";
import { deploymentToPoolMachine } from "../../src/alien.js";

const running = {
	id: "dep_1",
	status: "running",
	stackSettings: {
		compute: {
			pools: {
				stateful: {
					mode: "fixed",
					machines: 1,
					machine: "t4g.micro",
					failure_domains: { spread: 1 },
				},
			},
		},
	},
};

describe("a deployment's pool machine", () => {
	test("is read from the pool's compute settings", () => {
		const machine = deploymentToPoolMachine({
			deployment: running,
			pool: "stateful",
		});

		expect(machine).toBe("t4g.micro");
	});

	test("is null for a pool the deployment does not have", () => {
		const machine = deploymentToPoolMachine({
			deployment: running,
			pool: "stateless",
		});

		expect(machine).toBeNull();
	});

	test("is null for a deployment with no compute settings", () => {
		const machine = deploymentToPoolMachine({
			deployment: { id: "dep_1", status: "running" },
			pool: "stateful",
		});

		expect(machine).toBeNull();
	});
});
