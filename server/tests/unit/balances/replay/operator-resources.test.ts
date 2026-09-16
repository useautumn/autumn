import { describe, expect, test } from "bun:test";
import {
	closeReplayOperatorResources,
	type ReplayOperatorClosePorts,
} from "@/internal/balances/replay/operator/closeReplayOperatorResources.js";
import {
	describeReplayOperatorError,
	ReplayOperatorCleanupError,
	ReplayOperatorError,
} from "@/internal/balances/replay/operator/replayOperatorErrors.js";

const RAW_DATABASE_FAILURE =
	'password authentication failed for user "replay_operator"';
const CLOSE_ORDER = ["coordinator", "owners", "source", "database"];

type PortRecorder = {
	order: string[];
	ports: ReplayOperatorClosePorts;
};

function buildDatabaseFailure(): Error {
	const failure = new Error(RAW_DATABASE_FAILURE);
	failure.name = "PostgresError";
	return failure;
}

function createRecordingPorts({
	failingPort,
}: {
	failingPort?: string;
} = {}): PortRecorder {
	const order: string[] = [];
	function record(port: string): void {
		order.push(port);
		if (port === failingPort) throw buildDatabaseFailure();
	}
	return {
		order,
		ports: {
			closeCoordinator: async () => record("coordinator"),
			stopOwners: async () => record("owners"),
			closeSource: () => record("source"),
			endPool: async () => record("database"),
		},
	};
}

async function captureCleanupError({
	ports,
}: {
	ports: ReplayOperatorClosePorts;
}): Promise<ReplayOperatorCleanupError> {
	try {
		await closeReplayOperatorResources({ ports });
	} catch (error) {
		if (error instanceof ReplayOperatorCleanupError) return error;
		throw error;
	}
	throw new Error("expected the replay operator cleanup to fail");
}

describe("Replay operator resource cleanup", () => {
	test.concurrent(
		"drains the coordinator before the source and the pool",
		async () => {
			const recorder = createRecordingPorts();

			await closeReplayOperatorResources({ ports: recorder.ports });

			expect(recorder.order).toEqual(CLOSE_ORDER);
		},
	);

	test.concurrent(
		"stops every remaining port after a failed close",
		async () => {
			const recorder = createRecordingPorts({ failingPort: "coordinator" });

			const error = await captureCleanupError({ ports: recorder.ports });

			expect(recorder.order).toEqual(CLOSE_ORDER);
			expect(error.failures).toEqual([
				{ port: "coordinator", errorName: "PostgresError" },
			]);
			expect(error.message).not.toContain(RAW_DATABASE_FAILURE);
		},
	);

	test.concurrent(
		"closes only the ports a failed startup managed to create",
		async () => {
			const order: string[] = [];

			await closeReplayOperatorResources({
				ports: {
					stopOwners: () => {
						order.push("owners");
					},
				},
			});

			expect(order).toEqual(["owners"]);
		},
	);
});

describe("Replay operator error descriptions", () => {
	test.concurrent(
		"keeps names and codes only for infrastructure failures",
		() => {
			const failure = Object.assign(buildDatabaseFailure(), { code: "28P01" });

			expect(describeReplayOperatorError({ error: failure })).toEqual({
				name: "PostgresError",
				code: "28P01",
			});
		},
	);

	test.concurrent("keeps the reason of operator refusals", () => {
		const refusal = new ReplayOperatorError({
			message: "baseline not confirmed",
		});

		expect(describeReplayOperatorError({ error: refusal })).toEqual({
			name: "ReplayOperatorError",
			reason: "baseline not confirmed",
		});
	});

	test.concurrent("names non-error rejections without echoing them", () => {
		expect(
			describeReplayOperatorError({ error: RAW_DATABASE_FAILURE }),
		).toEqual({
			name: "UnknownError",
		});
	});
});
