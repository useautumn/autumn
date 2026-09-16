import type { BalanceWorkerEnv } from "@autumn/env/balanceWorker";
import type { AutumnLogger } from "@autumn/logging";
import type { Admin, Kafka } from "kafkajs";
import type { PartitionCheckpointSource } from "../../checkpoint/partitionCheckpointSource.js";
import type { Partitions } from "../../partitions/types/partitions.js";
import type { MeteringPartitionResolver } from "../../runtime/types/partitionRuntime.js";
import type { SqliteBalanceStateStore } from "../../state/sqliteBalanceStateStore.js";

export type BalanceWorker = {
	start(): Promise<void>;
	stop(): Promise<void>;
};

export type BalanceWorkerDependencies = {
	checkpointSource?: PartitionCheckpointSource;
	logger: Pick<AutumnLogger, "info" | "warn" | "error">;
	onError(failure: { cause: unknown }): void;
};

export type BalanceWorkerConfig = { env: BalanceWorkerEnv };

export type WorkerAddress = { hostname: string; endpoint: string };

export type EcsContainerMetadata = {
	Networks?: { NetworkMode: string; IPv4Addresses?: string[] }[];
};

export type WorkerListener = { stop(): Promise<void> | void };

export type WorkerLifecycleContext = {
	partitions: Pick<Partitions, "start" | "stop">;
	listen(): WorkerListener;
	settleResources(): Promise<void>;
	closeStore(): void;
};

export type WorkerResourcesContext = {
	kafka: Pick<Kafka, "producer" | "consumer" | "admin">;
	admin: Pick<Admin, "disconnect" | "fetchTopicOffsets">;
	stateStore: SqliteBalanceStateStore;
	partitionResolver: MeteringPartitionResolver;
};

export type WorkerRuntimeResource = {
	stop(): Promise<void>;
	waitForQuiescence(): Promise<void>;
};

export type WorkerResources = WorkerResourcesContext & {
	registerRuntime<Runtime extends WorkerRuntimeResource>(
		runtime: Runtime,
	): Runtime;
	settleResources(): Promise<void>;
	closeStore(): void;
};
