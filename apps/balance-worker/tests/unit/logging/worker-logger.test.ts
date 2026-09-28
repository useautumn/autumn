import { expect, spyOn, test } from "bun:test";
import * as logging from "@autumn/logging";
import { getBalanceWorkerLogger } from "../../../src/logging/getBalanceWorkerLogger.js";

test.concurrent(
	"worker logs carry their deployment namespace without constructing a real transport",
	() => {
		const previous = process.env.BALANCE_WORKER_DEPLOYMENT;
		let options: Parameters<typeof logging.createAppLogger>[0] | undefined;
		const captured = new Error("Captured logger configuration");
		const factory = spyOn(logging, "createAppLogger").mockImplementation(
			(input) => {
				options = input;
				throw captured;
			},
		);
		try {
			process.env.BALANCE_WORKER_DEPLOYMENT = "tf-balance-staging-v1";
			expect(() => getBalanceWorkerLogger()).toThrow(captured);
			expect(options).toEqual({
				service: "balance-worker",
				dataset: "express",
				preset: "dual",
				context: { workerDeployment: "tf-balance-staging-v1" },
			});
		} finally {
			factory.mockRestore();
			if (previous === undefined) delete process.env.BALANCE_WORKER_DEPLOYMENT;
			else process.env.BALANCE_WORKER_DEPLOYMENT = previous;
		}
	},
);

test("deployed workers log once, to stdout, and leave shipping to FireLens", () => {
	const previous = process.env.NODE_ENV;
	let options: Parameters<typeof logging.createAppLogger>[0] | undefined;
	const captured = new Error("Captured logger configuration");
	const factory = spyOn(logging, "createAppLogger").mockImplementation(
		(input) => {
			options = input;
			throw captured;
		},
	);
	try {
		process.env.NODE_ENV = "production";
		expect(() => getBalanceWorkerLogger()).toThrow(captured);
		// FireLens already ships stdout to Axiom; a pino Axiom transport as well
		// sent every line twice and cost ~10% of a busy worker's CPU.
		expect(options?.outputs).toEqual(["console-json"]);
	} finally {
		factory.mockRestore();
		process.env.NODE_ENV = previous;
	}
});
