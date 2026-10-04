import { z } from "zod/v4";
import { BALANCE_WORKER_THREADS_CONFIG_KEY } from "../../keys.js";

const MiB = 1 << 20;
const ringBytes = z
	.number()
	.int()
	.min(1 << 16)
	.refine((bytes) => (bytes & (bytes - 1)) === 0, "a power of two");

/**
 * How a balance worker lays its threads out beside the decide thread. Read once at boot: a thread layout
 * cannot change while the process runs.
 */
export const BalanceWorkerThreadsEdgeConfigSchema = z
	.object({
		/** `Bun.serve` threads beside the decide and producer threads (2 vCPU). */
		httpWorkers: z.number().int().min(1).max(8).default(1),
		/** Bytes per HTTP worker: request frames on their way to the decide thread. */
		requestRingBytes: ringBytes.default(4 * MiB),
		/** Bytes per HTTP worker: replies on their way back. */
		replyRingBytes: ringBytes.default(16 * MiB),
	})
	.strict();

export type BalanceWorkerThreadsEdgeConfig = z.infer<
	typeof BalanceWorkerThreadsEdgeConfigSchema
>;

export const defaultBalanceWorkerThreadsEdgeConfig =
	(): BalanceWorkerThreadsEdgeConfig => ({
		httpWorkers: 1,
		requestRingBytes: 4 * MiB,
		replyRingBytes: 16 * MiB,
	});

export const balanceWorkerThreadsEdgeConfig = {
	key: BALANCE_WORKER_THREADS_CONFIG_KEY,
	schema: BalanceWorkerThreadsEdgeConfigSchema,
	defaultValue: defaultBalanceWorkerThreadsEdgeConfig,
} as const;
