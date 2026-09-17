import { createPartitionCheckpointExporter } from "../../../../src/checkpoint/partitionCheckpointExporter.js";
import type { PartitionCheckpointPublisher } from "../../../../src/checkpoint/partitionCheckpointPublisher.js";
import { createPartitionCheckpointScheduler } from "../../../../src/checkpoint/scheduling/partitionCheckpointScheduler.js";
import type {
	PartitionCheckpointSchedulerClock,
	PartitionCheckpointSchedulerConfig,
} from "../../../../src/checkpoint/scheduling/partitionCheckpointSchedulerConfig.js";
import { defaultPartitionCheckpointSchedulerConfig } from "../../../../src/checkpoint/scheduling/partitionCheckpointSchedulerConfig.js";
import { openSqliteBalanceStateStore } from "../../../../src/state/sqliteBalanceStateStore.js";
import { createState } from "../../kafka/kafka-test-fixtures.js";

export class SchedulerClock implements PartitionCheckpointSchedulerClock {
	time = 1_700_000_000_000;
	workTime = 0;
	sample = 0.5;
	onYield = (): void => {};
	private nextTimer = 0;
	private timers = new Map<number, { at: number; run(): void }>();
	now = (): number => this.time;
	monotonicNow = (): number => this.workTime;
	random = (): number => this.sample;
	schedule = ({
		delayMs,
		run,
	}: {
		delayMs: number;
		run(): void;
	}): (() => void) => {
		const id = this.nextTimer++;
		this.timers.set(id, { at: this.time + delayMs, run });
		return () => this.timers.delete(id);
	};
	yield = async (): Promise<void> => {
		this.onYield();
	};
	settle = async (): Promise<void> => {
		for (let index = 0; index < 20; index++) await Promise.resolve();
	};
	advance = async (milliseconds: number): Promise<void> => {
		const target = this.time + milliseconds;
		for (;;) {
			let selected: [number, { at: number; run(): void }] | null = null;
			for (const candidate of this.timers) {
				if (
					candidate[1].at <= target &&
					(selected === null || candidate[1].at < selected[1].at)
				)
					selected = candidate;
			}
			if (!selected) break;
			this.time = selected[1].at;
			this.timers.delete(selected[0]);
			selected[1].run();
			await this.settle();
		}
		this.time = target;
		await this.settle();
	};
	get pendingTimers(): number {
		return this.timers.size;
	}
}

export const createSchedulerFixture = ({
	publish = async () => ({ kind: "published", etag: "etag" }),
	configuration = {},
}: {
	publish?: PartitionCheckpointPublisher["publish"];
	configuration?: Partial<PartitionCheckpointSchedulerConfig>;
} = {}) => {
	const topic = "metering-events-v1";
	const clock = new SchedulerClock();
	const store = openSqliteBalanceStateStore({ databasePath: ":memory:" });
	const limits = {
		maxSerializedBytes: 1_000_000,
		maxStates: 100,
		maxReceipts: 1_000,
	};
	const exporter = createPartitionCheckpointExporter({
		stateStore: store,
		publisher: { publish },
		clock,
		limits,
	});
	const scheduler = createPartitionCheckpointScheduler({
		stateStore: store,
		exporter,
		clock,
		config: {
			...defaultPartitionCheckpointSchedulerConfig,
			intervalMs: 100,
			jitterRatio: 0,
			pollIntervalMs: 10,
			cleanupIntervalMs: 100,
			exportTimeoutMs: 50,
			initialBackoffMs: 10,
			maxBackoffMs: 20,
			...configuration,
		},
	});
	const failures: unknown[] = [];
	const initialize = ({ partition }: { partition: number }) => {
		store.initializePartition({ topic, partition, nextOffset: 0n });
		const state = createState();
		state.identity.customerId = `cus_${partition}`;
		store.applyDurableStateInitialization({
			position: { topic, partition, offset: 0n },
			initialization: {
				schemaVersion: 1,
				type: "state_initialized",
				initializationId: `init_${partition}`,
				initializedAt: clock.now(),
				state,
			},
		});
		return state;
	};
	const start = ({
		partition,
		consumed = () => null,
	}: {
		partition: number;
		consumed?: () => bigint | null;
	}) => {
		const controller = new AbortController();
		const lease = scheduler.start({
			topic,
			partition,
			signal: controller.signal,
			readConsumedNextOffset: consumed,
			onStateFailure: ({ cause }) => {
				failures.push(cause);
				controller.abort(cause);
			},
		});
		return { controller, lease };
	};
	return {
		topic,
		clock,
		store,
		exporter,
		scheduler,
		failures,
		initialize,
		start,
		close: async () => {
			await scheduler.stop();
			store.close();
		},
	};
};
