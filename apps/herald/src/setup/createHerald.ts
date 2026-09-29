import type { BalanceWorkerClient } from "@autumn/balance-worker-client";
import {
	createSlotGate,
	fleetIdOf,
	resolveTaskIdentity,
	type TaskIdentity,
} from "@autumn/blue-green";
import type { ByocCacheWriter } from "@autumn/byoc";
import type { MiscCache } from "@autumn/cache";
import type { CatalogCache } from "@autumn/catalog-lru";
import type { HeraldEnv } from "@autumn/env/herald";
import {
	createKafkaClient,
	createKafkaTransport,
	KafkaWithSettledTopicOffsets,
} from "@autumn/kafka";
import type { AutumnLogger } from "@autumn/logging";
import type { EventsDb, PostgresClient } from "@autumn/postgres";
import type { SqsJobs } from "@autumn/sqs";
import type { SvixClient } from "@autumn/svix";
import type { EventsTinybird } from "@autumn/tinybird";
import { createCatalogInvalidationConsumer } from "../catalog/createCatalogInvalidationConsumer.js";
import { createHeraldConsumers } from "../consumers/heraldConsumers.js";
import type { HeraldEdgeConfigs } from "../edgeConfig/createHeraldEdgeConfigs.js";
import { createSlotFollower } from "../slot/followSlot.js";
import { createHeraldHeartbeat } from "../slot/heraldHeartbeat.js";
import { createHeraldReadinessProbes } from "../slot/heraldReadinessProbes.js";
import type { JobHealth } from "../slot/types/heraldHeartbeat.js";
import { createStreamConsumer } from "../stream/createStreamConsumer.js";
import type { RunningStreamConsumer } from "../stream/types/streamConsumer.js";

export type Herald = { start(): Promise<void>; stop(): Promise<void> };

/** How long a task on ECS waits for its first read of the slot record; the heartbeat reports the wait meanwhile. */
const FIRST_RECORD_RETRY_MS = 2_000;

/** Wiring only: one Kafka client, the slot herald follows, and the jobs the slot starts and stops. */
export function createHerald({
	ctx,
	config,
}: {
	ctx: {
		logger: AutumnLogger;
		eventsDb: EventsDb;
		eventsTinybird: EventsTinybird | null;
		svix: SvixClient | null;
		catalogCache: CatalogCache;
		postgres: Pick<PostgresClient, "db" | "close">;
		miscCache: Pick<
			MiscCache,
			"getActive" | "resolve" | "forEachTarget" | "close"
		>;
		sqsJobs: Pick<SqsJobs, "autoTopup" | "shutdown">;
		edgeConfigs: HeraldEdgeConfigs;
		balanceWorkerClient: Pick<
			BalanceWorkerClient,
			"start" | "stop" | "readSubjectState"
		>;
		cacheWriter: ByocCacheWriter | null;
		/** A job's consumer died for good; the caller ends the process so the task is replaced. */
		onConsumerCrashed: (params: { job: string; cause: unknown }) => void;
		/** Tests only: the identity ECS would have given this task. */
		identity?: TaskIdentity;
	};
	config: { env: HeraldEnv };
}): Herald {
	const { env } = config;
	const kafka = new KafkaWithSettledTopicOffsets(
		createKafkaClient({
			clientId: `herald-${crypto.randomUUID()}`,
			brokers: env.KAFKA_BROKERS,
			transport: createKafkaTransport({
				authMode: env.KAFKA_AUTH_MODE,
				region: env.AWS_REGION,
			}),
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
	const consumersCtx = { ...ctx, db: ctx.postgres.db };
	const jobNames = createHeraldConsumers({ ctx: consumersCtx }).map(
		(job) => job.name,
	);
	const catalogInvalidations = createCatalogInvalidationConsumer({
		ctx: { kafka, catalogCache: ctx.catalogCache, logger: ctx.logger },
		config: {
			topic: env.HERALD_CATALOG_INVALIDATION_TOPIC,
			groupIdPrefix: `${env.HERALD_GROUP_ID}-catalog`,
		},
	});
	/** The jobs of the current activation; empty while idle. A stopped consumer is single-use, so each activation builds anew. */
	let jobs: RunningStreamConsumer[] = [];
	let heartbeat: { start(): Promise<void>; stop(): void } | null = null;
	let follower: ReturnType<typeof createSlotFollower> | null = null;
	const started: Array<() => Promise<void>> = [];

	function buildJobs(): RunningStreamConsumer[] {
		return createHeraldConsumers({ ctx: consumersCtx }).map((streamConsumer) =>
			createStreamConsumer({
				ctx: { kafka, logger: ctx.logger, onCrashed: ctx.onConsumerCrashed },
				config: {
					topic: env.HERALD_METERING_TOPIC,
					groupIdPrefix: env.HERALD_GROUP_ID,
				},
				streamConsumer,
			}),
		);
	}

	/** Every job joins; one that fails to start takes the others back out, so the slot is never half in. */
	async function startJobs(): Promise<void> {
		jobs = buildJobs();
		const running: RunningStreamConsumer[] = [];
		try {
			for (const job of jobs) {
				await job.start();
				running.push(job);
			}
		} catch (cause) {
			await Promise.allSettled(running.map(stopConsumer));
			jobs = [];
			throw cause;
		}
	}

	/** Every job leaves, in parallel; a job that fails to stop does not keep the others in their groups. */
	async function stopJobs(): Promise<void> {
		const stopping = jobs;
		jobs = [];
		const results = await Promise.allSettled(stopping.map(stopConsumer));
		const errors = results.flatMap((result) =>
			result.status === "rejected" ? [result.reason] : [],
		);
		if (errors.length === 1) throw errors[0];
		if (errors.length > 1)
			throw new AggregateError(errors, "Jobs did not stop");
	}

	function stopConsumer(consumer: RunningStreamConsumer): Promise<void> {
		return consumer.stop();
	}

	function readJobs(): JobHealth[] {
		if (jobs.length > 0) return jobs.map((job) => job.health());
		return jobNames.map((name) => ({
			name,
			membership: "idle" as const,
			partitions: 0,
			maxLagRecords: null,
		}));
	}

	/** The misc client connects on first use, and a claim on a connecting client is refused: open it before the log is read. */
	async function openMiscCache(): Promise<void> {
		try {
			await ctx.miscCache.getActive().ping();
		} catch (cause) {
			ctx.logger.warn(
				{ error: cause, type: "herald_misc_cache_cold" },
				"Misc cache did not answer at start; its first claims may be refused",
			);
		}
	}

	/** In the background: only cache-push reads subjects, so its catch-up never holds the other jobs back. */
	function startBalanceWorkerClient(): void {
		ctx.balanceWorkerClient
			.start()
			.catch((cause) =>
				ctx.logger.error(
					{ error: cause, type: "herald_balance_worker_client_failed" },
					"Balance worker client did not start; cache-push reads will fail until it does",
				),
			);
	}

	/** On ECS the default record names no service and would open the gate; the first real read decides instead. */
	async function awaitFirstRecord({
		identity,
	}: {
		identity: TaskIdentity;
	}): Promise<void> {
		if (!identity.serviceArn) return;
		let waited = false;
		while (!ctx.edgeConfigs.activeSlot.getStatus().healthy) {
			if (!waited)
				ctx.logger.warn(
					{ type: "herald_slot_record_unread" },
					"Slot record not read yet; holding out of the groups until it is",
				);
			waited = true;
			await Bun.sleep(FIRST_RECORD_RETRY_MS);
			await ctx.edgeConfigs.activeSlot.refresh();
		}
	}

	/** A start that fails part way stops what it started, so a half-started herald never holds partitions. */
	async function start(): Promise<void> {
		try {
			const identity =
				ctx.identity ??
				(await resolveTaskIdentity({ ctx: { logger: ctx.logger }, env }));
			const fleetId = identity.serviceArn
				? fleetIdOf({ serviceArn: identity.serviceArn })
				: "local";
			await ctx.edgeConfigs.start();
			started.push(async () => ctx.edgeConfigs.stop());
			await openMiscCache();
			await admin.connect();
			started.push(() => admin.disconnect());
			await catalogInvalidations.start();
			started.push(() => catalogInvalidations.stop());
			startBalanceWorkerClient();
			started.push(() => ctx.balanceWorkerClient.stop());

			const gate = createSlotGate({
				ctx: {
					identity,
					activeSlot: ctx.edgeConfigs.activeSlot,
					logger: ctx.logger,
				},
			});
			heartbeat = createHeraldHeartbeat({
				ctx: {
					...ctx.edgeConfigs.adminBucket,
					gate,
					readJobs,
					readStoreHealthy: () =>
						ctx.edgeConfigs.activeSlot.getStatus().healthy,
					probes: createHeraldReadinessProbes({
						ctx: { admin, eventsDb: ctx.eventsDb, miscCache: ctx.miscCache },
						config: {
							topic: env.HERALD_METERING_TOPIC,
							groupIds: jobNames.map(
								(name) => `${env.HERALD_GROUP_ID}-${name}`,
							),
						},
					}),
					logger: ctx.logger,
				},
				config: { deployment: env.HERALD_DEPLOYMENT, fleetId, identity },
			});
			void heartbeat.start();
			started.push(async () => heartbeat?.stop());

			await awaitFirstRecord({ identity });
			follower = createSlotFollower({
				ctx: {
					gate,
					jobs: { start: startJobs, stop: stopJobs },
					logger: ctx.logger,
				},
			});
			ctx.logger.info(
				`Herald fleet ${fleetId}: service ${identity.serviceArn ?? "none"}, slot ${gate.describe().reason}, ${jobNames.length} job(s) over ${env.HERALD_METERING_TOPIC}`,
			);
			await follower.start();
			started.push(() => follower?.stop() ?? Promise.resolve());
		} catch (cause) {
			await stopStarted();
			throw cause;
		}
	}

	/** In reverse order of starting: the follower (and its jobs) first, the edge configs last. */
	async function stopStarted(): Promise<unknown[]> {
		const errors: unknown[] = [];
		for (const stopOne of started.splice(0).reverse()) {
			try {
				await stopOne();
			} catch (cause) {
				errors.push(cause);
			}
		}
		return errors;
	}

	async function stop(): Promise<void> {
		const errors = await stopStarted();
		for (const close of [closeSqs, closeMiscCache, closeStores]) {
			try {
				await close();
			} catch (cause) {
				errors.push(cause);
			}
		}
		if (errors.length === 1) throw errors[0];
		if (errors.length > 1)
			throw new AggregateError(errors, "Herald shutdown failed");
	}

	function closeSqs(): Promise<void> {
		return ctx.sqsJobs.shutdown();
	}
	async function closeMiscCache(): Promise<void> {
		ctx.miscCache.close();
	}
	async function closeStores(): Promise<void> {
		await Promise.all([ctx.eventsDb.close(), ctx.postgres.close()]);
	}

	return { start, stop };
}
