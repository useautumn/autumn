import { z } from "zod/v4";
import type { BatchMigrationChunkResult } from "@/internal/migrations/v2/batchOperations/execute/types/batchMigrationExecutionTypes.js";

export const QueuedLaneSchema = z.object({
	scenario: z.enum(["remove", "replace"]),
});

export type QueuedLane = z.infer<typeof QueuedLaneSchema>;
export type QueuedLaneScenario = QueuedLane["scenario"];

export type QueuedLanePhases = {
	claim: number;
	candidates: number;
	plans: number;
	produce: number;
};

export type QueuedLaneChunkResult = BatchMigrationChunkResult & {
	lane: "queued";
	produced: number;
	phases: QueuedLanePhases;
	firstProduceAt: number;
	lastProduceAt: number;
};
