import { expect, test } from "bun:test";
import {
	BALANCE_WORKER_HANDOFF_DRAIN_CAP_MS,
	BALANCE_WORKER_HANDOFF_READY_TIMEOUT_MS,
} from "@autumn/env/balanceWorkerConstants";

/** KIP-848 hands a moved partition over on the successor's next heartbeat: the broker's interval, 5s by default and at least. */
const BROKER_HEARTBEAT_INTERVAL_MS = 5_000;
/** A successor's read-only preparation, measured at 0.5-0.8s. */
const PREPARATION_MS = 1_000;
const ECS_STOP_TIMEOUT_MS = 90_000;

test("a revoked owner waits for a successor through a whole broker heartbeat and its preparation, with room to spare", () => {
	// Measured on Kafka 4.3.1: a partition reaches its new owner 3-5.2s after the old owner gives it up.
	expect(BALANCE_WORKER_HANDOFF_READY_TIMEOUT_MS).toBeGreaterThanOrEqual(
		2 * (BROKER_HEARTBEAT_INTERVAL_MS + PREPARATION_MS),
	);
});

test("a graceful stop's one wave of handoffs, ready wait then drain, fits the deploy's stop timeout", () => {
	expect(
		BALANCE_WORKER_HANDOFF_READY_TIMEOUT_MS +
			BALANCE_WORKER_HANDOFF_DRAIN_CAP_MS,
	).toBeLessThan(ECS_STOP_TIMEOUT_MS);
});
