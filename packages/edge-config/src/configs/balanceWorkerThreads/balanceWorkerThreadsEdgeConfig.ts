import { z } from "zod/v4";
import { BALANCE_WORKER_THREADS_CONFIG_KEY } from "../../keys.js";

const MiB = 1 << 20;
const ringBytes = z
	.number()
	.int()
	.min(1 << 16)
	.refine((bytes) => (bytes & (bytes - 1)) === 0, "a power of two");

export const BalanceWorkerThreadsEdgeConfigSchema = z
	.object({
		httpWorkers: z.number().int().min(1).max(8).default(1),
		requestRingBytes: ringBytes.default(4 * MiB),
		replyRingBytes: ringBytes.default(16 * MiB),
		sendRingBytes: ringBytes.default(4 * MiB),
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
		sendRingBytes: 4 * MiB,
	});

export const balanceWorkerThreadsEdgeConfig = {
	key: BALANCE_WORKER_THREADS_CONFIG_KEY,
	schema: BalanceWorkerThreadsEdgeConfigSchema,
	defaultValue: defaultBalanceWorkerThreadsEdgeConfig,
} as const;
