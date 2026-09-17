import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import type { MeteringIdentity } from "@autumn/balance-engine";
import { createKafkaClient, meteringIdentityToPartition } from "@autumn/kafka";
import { Kafka } from "kafkajs";
import {
	openSqliteBalanceStateStore,
	type SqliteBalanceStateStore,
} from "../state/sqliteBalanceStateStore.js";
import type {
	BalanceWorkerConfig,
	WorkerResources,
	WorkerResourcesContext,
	WorkerRuntimeResource,
} from "./types/balanceWorker.js";
import { validateBalanceWorkerTopics } from "./workerConfig.js";

export async function openWorkerResources({
	config,
}: {
	config: BalanceWorkerConfig;
}): Promise<WorkerResources> {
	const { env } = config;
	const kafka = new Kafka(
		createKafkaClient({
			clientId: `balance-worker-${crypto.randomUUID()}`,
			brokers: env.KAFKA_BROKERS,
			transport: {},
			limits: {
				connectionTimeoutMs: 5000,
				requestTimeoutMs: 30000,
				retryCount: 2,
				initialRetryTimeMs: 100,
				maxRetryTimeMs: 1000,
			},
		}),
	);
	const admin = kafka.admin();
	function partitionForIdentity({
		identity,
	}: {
		identity: MeteringIdentity;
	}): number {
		return meteringIdentityToPartition({
			identity,
			partitionCount: env.BALANCE_WORKER_PARTITION_COUNT,
		});
	}
	const partitionResolver = { partitionForIdentity };
	let stateStore: SqliteBalanceStateStore | undefined;
	try {
		await admin.connect();
		await validateBalanceWorkerTopics({ admin, env });
		mkdirSync(dirname(env.BALANCE_WORKER_SQLITE_PATH), { recursive: true });
		stateStore = openSqliteBalanceStateStore({
			databasePath: env.BALANCE_WORKER_SQLITE_PATH,
		});
		return createWorkerResources({
			ctx: { kafka, admin, stateStore, partitionResolver },
		});
	} catch (cause) {
		stateStore?.close();
		await admin.disconnect();
		throw cause;
	}
}

export function createWorkerResources({
	ctx,
}: {
	ctx: WorkerResourcesContext;
}): WorkerResources {
	const runtimes = new Set<WorkerRuntimeResource>();

	function registerRuntime<Runtime extends WorkerRuntimeResource>(
		runtime: Runtime,
	): Runtime {
		runtimes.add(runtime);
		async function waitForQuiescence(): Promise<void> {
			await runtime.waitForQuiescence();
			runtimes.delete(runtime);
		}
		return { ...runtime, waitForQuiescence };
	}

	async function settleRuntime(runtime: WorkerRuntimeResource): Promise<void> {
		try {
			await runtime.stop();
		} finally {
			await runtime.waitForQuiescence();
		}
		runtimes.delete(runtime);
	}

	async function settleResources(): Promise<void> {
		const pending: Promise<void>[] = [];
		for (const runtime of [...runtimes]) pending.push(settleRuntime(runtime));
		const results = await Promise.allSettled(pending);
		await ctx.admin.disconnect();
		const errors: unknown[] = [];
		for (const result of results) {
			if (result.status === "rejected") errors.push(result.reason);
		}
		if (errors.length > 0)
			throw new AggregateError(errors, "Worker runtimes did not settle safely");
	}

	function closeStore(): void {
		ctx.stateStore.close();
	}

	return { ...ctx, registerRuntime, settleResources, closeStore };
}
