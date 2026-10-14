import type { CatalogCache } from "@autumn/catalog-lru";
import type { DynamoClient, IdempotencyKeyStore } from "@autumn/dynamodb";
import type { BalanceWorkerEnv } from "@autumn/env/balanceWorker";
import type { CatalogInvalidationConsumer } from "@autumn/kafka";
import type { AutumnLogger } from "@autumn/logging";
import type { PostgresClient } from "@autumn/postgres";
import type { Admin, Kafka } from "kafkajs";
import type { PartitionCheckpointSource } from "../../checkpoint/partitionCheckpointSource.js";
import type { WorkerEdgeConfigs } from "../../edgeConfig/createWorkerEdgeConfigs.js";
import type {
	PartitionServiceStopReason,
	Partitions,
} from "../../partitions/types/partitions.js";
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
	onServiceStopped?(reason: PartitionServiceStopReason): void;
	onIdentityResolved?(identity: {
		serviceArn: string | null;
		imageSha: string | null;
		fleetId: string | null;
	}): void;
};

export type BalanceWorkerConfig = {
	env: BalanceWorkerEnv;
	stateBackend?: StateBackend;
};

export type WorkerAddress = { hostname: string; endpoint: string };

export type EcsContainerMetadata = {
	Networks?: { NetworkMode: string; IPv4Addresses?: string[] }[];
};

export type WorkerListener = { stop(): Promise<void> | void };

export type WorkerLifecycleContext = {
	partitions: Pick<Partitions, "start" | "stop">;
	edgeConfigs?: Pick<WorkerEdgeConfigs, "start">;
	healthReporter?: { start(): void; stop(): void };
	catalogInvalidations?: Pick<CatalogInvalidationConsumer, "start" | "stop">;
	coldStart?: { start(): void; stop(): void };
	listen(): Promise<WorkerListener>;
	settleResources(): Promise<void>;
	closeStore(): void;
};

export type WorkerResourcesContext = {
	kafka: Pick<Kafka, "producer" | "consumer" | "admin">;
	admin: Pick<Admin, "disconnect" | "fetchTopicOffsets">;
	stateStore: StateStore;
	postgres: Pick<PostgresClient, "close"> &
		Partial<Pick<PostgresClient, "client">>;
	db: WorkerDb;
	dynamo: Pick<DynamoClient, "close">;
	idempotencyKeys: IdempotencyKeyStore;
	catalogCache: CatalogCache;
	catalogInvalidations?: CatalogInvalidationConsumer;
	partitionResolver: MeteringPartitionResolver;
	bootstrapper: PartitionBootstrapper;
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
