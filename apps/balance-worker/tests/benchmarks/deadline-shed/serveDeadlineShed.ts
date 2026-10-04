import type { MeteringIdentity } from "@autumn/balance-engine";
import { DEADLINE_SHED_EXPERIMENT } from "../../../src/experiments/deadlineShed.js";
import { createBalanceWorkerApp } from "../../../src/http/createBalanceWorkerApp.js";
import { createBalanceWorkerFetch } from "../../../src/http/fastPath/createBalanceWorkerFetch.js";
import type { BalanceWorkerRequestContext } from "../../../src/http/types/balanceWorkerHttp.js";
import { getBalanceWorkerLogger } from "../../../src/logging/getBalanceWorkerLogger.js";
import { getCheckAdmission } from "../../../src/runtime/deadlineShed/checkAdmission.js";
import { processCommand } from "../../../src/runtime/processCommand.js";
import type { PartitionRuntimeScope } from "../../../src/runtime/types/partitionRuntimeState.js";
import {
	createInitializeRequest,
	testIdentity,
} from "../../fixtures/mutations.js";
import { forceStagingArm } from "../../fixtures/stagingArms.js";
import { createBenchProcessor } from "../track-throughput/createBenchProcessor.js";
import { scenarios } from "../track-throughput/scenarios.js";

/** One task for `run.ts`: a real partition processor behind the worker's real fetch and processCommand, on a socket. */
const arm = process.env.DEADLINE_SHED_ARM === "B" ? "B" : "A";
const quietCustomers = Number(process.env.DEADLINE_SHED_QUIET ?? 20);
if (arm === "B")
	forceStagingArm({ experiment: DEADLINE_SHED_EXPERIMENT, arm: "B" });

const scenario = scenarios.typical;
if (!scenario) throw new Error("bench fixture");

const benchCustomerOf = (customerId: string): MeteringIdentity => ({
	...testIdentity,
	customerId,
	entityId: null,
});

const bench = await createBenchProcessor({
	scenario,
	partition: 0,
	latency: {
		appendMs: Number(process.env.DEADLINE_SHED_APPEND_MS ?? 4),
		applyMs: 0,
	},
	serialize: true,
});
const customers = [
	"cus_hot",
	...Array.from({ length: quietCustomers }, (_, index) => `cus_quiet_${index}`),
];
for (const customerId of customers)
	await bench.processor.initialize({
		request: createInitializeRequest({
			state: scenario.stateFor({ identity: benchCustomerOf(customerId) }),
		}),
	});

// A ready runtime's scope: processCommand reads only the processor and the ready status from it.
const scope = {
	ctx: { processor: bench.processor },
	state: { status: "ready", terminalError: null },
} as unknown as PartitionRuntimeScope;
const runtime: BalanceWorkerRequestContext["runtime"] = {
	process: (run, options) =>
		processCommand({ ...scope, run, budgetMs: options?.budgetMs }),
};
const ctx = {
	ownership: { findRuntime: () => runtime },
	partitionResolver: { partitionForIdentity: () => 0 },
	logger: getBalanceWorkerLogger(),
	requestLog: { successSampleRate: 0.05 },
};
const fetch = createBalanceWorkerFetch({
	ctx,
	app: createBalanceWorkerApp({ ctx }),
});

/** Responses by status: a drop answers after its caller has gone, so only the server can count it. */
const statuses: Record<number, number> = {};
async function serve(request: Request): Promise<Response> {
	if (new URL(request.url).pathname === "/bench-stats")
		return Response.json({
			statuses,
			admission: arm === "B" ? getCheckAdmission().readCounters() : null,
		});
	const response = await fetch(request);
	statuses[response.status] = (statuses[response.status] ?? 0) + 1;
	return response;
}
const server = Bun.serve({ port: 0, idleTimeout: 0, fetch: serve });
console.error(`READY ${server.port}`);
