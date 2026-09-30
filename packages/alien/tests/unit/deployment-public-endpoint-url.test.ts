import { describe, expect, test } from "bun:test";
import { deploymentToPublicEndpointUrl } from "../../src/alien.js";

const running = {
	id: "dep_1",
	status: "running",
	stackState: {
		resources: {
			atom: {
				outputs: {
					publicEndpoints: { api: { url: "http://localhost:60040" } },
				},
			},
		},
	},
};

describe("a deployment's public endpoint", () => {
	test("is read from the resource's outputs", () => {
		const url = deploymentToPublicEndpointUrl({
			deployment: running,
			resourceId: "atom",
			endpointName: "api",
		});

		expect(url).toBe("http://localhost:60040");
	});

	test("is null until the resource has outputs", () => {
		const pending = { id: "dep_1", status: "pending" };
		const provisioning = {
			...running,
			stackState: { resources: { atom: { outputs: null } } },
		};

		for (const deployment of [pending, provisioning])
			expect(
				deploymentToPublicEndpointUrl({
					deployment,
					resourceId: "atom",
					endpointName: "api",
				}),
			).toBeNull();
	});
});
