import type { BalanceWorkerEnv } from "@autumn/env/balanceWorker";
import type { AutumnLogger } from "@autumn/logging";
import type { PostgresClient } from "@autumn/postgres";
import type { Admin, Kafka } from "kafkajs";
import type { CatalogCache } from "../../catalog/types/catalogCache.js";
import type { PartitionCheckpointSource } from "../../checkpoint/partitionCheckpointSource.js";
import type { WorkerEdgeConfigs } from "../../edgeConfig/createWorkerEdgeConfigs.js";
import type { Partitions } from "../../partitions/types/partitions.js";
import type { PartitionBootstrapper } from "../../runtime/bootstrap/types/partitionBootstrap.js";
import type { MeteringPartitionResolver } from "../../runtime/types/partitionRuntime.js";
import type { StateBackend } from "../../state/stateBackend.js";
import type { StateStore } from "../../state/types/stateStore.js";
import type { WorkerDb } from "../../types/workerDb.js";
import type { WorkerCheckpointResources } from "./workerCheckpointResources.js";

export type BalanceWorker = {
	start(): Promise<void>;
	stop(): Promise<void>;
};

export type BalanceWorkerDependencies = {
	checkpointSource?: PartitionCheckpointSource;
	logger: Pick<AutumnLogger, "debug" | "info" | "warn" | "error">;
	onError(failure: { cause: unknown }): void;
};

export type BalanceWorkerConfig = {
	env: BalanceWorkerEnv;
	/** Overrides the STATE_BACKEND constant; tests exercise both backends. */
	stateBackend?: StateBackend;
};

export type WorkerAddress = { hostname: string; endpoint: string };

export type EcsContainerMetadata = {
	Networks?: { NetworkMode: string; IPv4Addresses?: string[] }[];
};

export type WorkerListener = { stop(): Promise<void> | void };

export type WorkerLifecycleContext = {
	partitions: Pick<Partitions, "start" | "stop">;
	/** Polled before partitions start, so the first flush already sees the live knobs. */
	edgeConfigs?: Pick<WorkerEdgeConfigs, "start">;
	healthReporter?: { start(): void; stop(): void };
	listen(): WorkerListener;
	settleResources(): Promise<void>;
	closeStore(): void;
};

export type WorkerResourcesContext = {
	kafka: Pick<Kafka, "producer" | "consumer" | "admin">;
	admin: Pick<Admin, "disconnect" | "fetchTopicOffsets">;
	stateStore: StateStore;
	postgres: Pick<PostgresClient, "close">;
	db: WorkerDb;
	catalogCache: CatalogCache;
	partitionResolver: MeteringPartitionResolver;
	bootstrapper: PartitionBootstrapper;
	/** Only the sqlite backend checkpoints; the postgres backend's bookmark lives in Postgres. */
	checkpoints?: WorkerCheckpointResources;
	edgeConfigs?: WorkerEdgeConfigs;
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
