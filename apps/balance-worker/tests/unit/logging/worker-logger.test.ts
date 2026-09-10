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
