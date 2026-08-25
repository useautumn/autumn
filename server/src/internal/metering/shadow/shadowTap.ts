import { generateAuthToken } from "aws-msk-iam-sasl-signer-js";
import { Kafka, logLevel } from "kafkajs";
import { logger } from "@/external/logtail/logtailUtils.js";
import type { MeteringEvent } from "../events/meteringEventSchema.js";
import { partitionForEvent } from "../log/kafkaMeteringLog.js";
import {
	buildShadowDeductEvent,
	type ShadowDeductParams,
} from "./shadowDeductEvent.js";
import {
	isOrgTapped,
	readShadowTapConfig,
	type ShadowTapConfig,
} from "./shadowTapConfig.js";

export const SHADOW_TAP_QUEUE_CAPACITY = 10_000;

const FLUSH_INTERVAL_MS = 250;
const MAX_BATCH_SIZE = 500;
const WARN_INTERVAL_MS = 60_000;
// The deployed metering worker owns partition 0 only (see metering-worker.ts),
// so the mirror targets a single partition exactly like the loadtest producer.
const SHADOW_PARTITION_COUNT = 1;

export type ShadowProducerRecord = {
	topic: string;
	messages: { key: string; partition: number; value: string }[];
};

/** The slice of a kafkajs producer the tap needs: narrow enough that tests can
 *  hand it a fake, wide enough that a real `Producer` satisfies it. */
export type ShadowProducer = {
	connect(): Promise<void>;
	send(record: ShadowProducerRecord): Promise<unknown>;
	disconnect(): Promise<void>;
};

export type ShadowTapWarning = {
	message: string;
	error: unknown;
	dropped: number;
	queueDepth: number;
};

const logShadowTapWarning = ({
	message,
	error,
	dropped,
	queueDepth,
}: ShadowTapWarning): void => {
	logger.warn(`[metering-shadow-tap] ${message}`, {
		error,
		dropped,
		queue_depth: queueDepth,
	});
};

/**
 * Mirrors committed balance deductions onto the metering events topic without
 * ever standing between the caller and its response: `record` only appends to
 * a bounded in-memory queue, and a detached interval does the Kafka work. Any
 * failure degrades to dropped mirror events, never to a failed track.
 */
export class ShadowTap {
	private readonly config: ShadowTapConfig;
	private readonly createProducer: () => ShadowProducer;
	private readonly onWarn: (warning: ShadowTapWarning) => void;
	private readonly queue: MeteringEvent[] = [];
	private producer: ShadowProducer | null = null;
	private connecting: Promise<void> | null = null;
	private timer: ReturnType<typeof setInterval> | null = null;
	private flushing = false;
	private disabled = false;
	private droppedCount = 0;
	private lastWarnAtMs = 0;

	constructor({
		config,
		createProducer,
		onWarn = logShadowTapWarning,
	}: {
		config: ShadowTapConfig;
		createProducer: () => ShadowProducer;
		onWarn?: (warning: ShadowTapWarning) => void;
	}) {
		this.config = config;
		this.createProducer = createProducer;
		this.onWarn = onWarn;
	}

	get queueDepth(): number {
		return this.queue.length;
	}

	get dropped(): number {
		return this.droppedCount;
	}

	get isDisabled(): boolean {
		return this.disabled;
	}

	/** Synchronous by contract: the serving path must never await the mirror. */
	record(params: ShadowDeductParams): void {
		if (this.disabled) return;

		// Re-read per deduction so the admin toggle takes effect within one edge
		// config poll, without ever blocking on S3.
		const enablement = this.config.readEnablement();
		if (!enablement.enabled) return;
		if (!isOrgTapped({ enablement, orgId: params.orgId })) return;

		const event = buildShadowDeductEvent(params);
		if (!event) return;

		if (this.queue.length >= SHADOW_TAP_QUEUE_CAPACITY) {
			this.queue.shift();
			this.droppedCount++;
		}
		this.queue.push(event);
		this.startTimer();
	}

	/** Drains whatever is queued. Resolves even when Kafka is broken. */
	async flushPending(): Promise<void> {
		if (this.flushing || this.disabled || this.queue.length === 0) return;
		this.flushing = true;

		try {
			const producer = await this.connectProducer();
			if (!producer) return;

			while (this.queue.length > 0 && !this.disabled) {
				const batch = this.queue.splice(0, MAX_BATCH_SIZE);
				try {
					await producer.send({
						topic: this.config.topic,
						messages: batch.map((event) => ({
							key: `${event.org_id}:${event.customer_id}`,
							partition: partitionForEvent({
								event,
								partitionCount: SHADOW_PARTITION_COUNT,
							}),
							value: JSON.stringify(event),
						})),
					});
				} catch (error) {
					// Dropped, not retried: holding a backlog for a broken broker
					// only buys a bigger drop later.
					this.droppedCount += batch.length;
					this.warn({ message: "send failed", error });
					return;
				}
			}
		} catch (error) {
			this.warn({ message: "flush failed", error });
		} finally {
			this.flushing = false;
		}
	}

	/** Best-effort teardown; safe to call more than once. */
	async shutdown(): Promise<void> {
		if (this.timer) {
			clearInterval(this.timer);
			this.timer = null;
		}
		this.queue.length = 0;

		const producer = this.producer;
		this.producer = null;
		if (!producer) return;
		await producer.disconnect().catch(() => {});
	}

	private startTimer(): void {
		if (this.timer || this.disabled) return;
		this.timer = setInterval(() => {
			void this.flushPending();
		}, FLUSH_INTERVAL_MS);
		// Never hold the process open on the mirror.
		this.timer.unref?.();
	}

	private async connectProducer(): Promise<ShadowProducer | null> {
		if (this.producer) return this.producer;
		if (!this.connecting) {
			this.connecting = this.openProducer();
		}
		await this.connecting;
		return this.producer;
	}

	private async openProducer(): Promise<void> {
		try {
			const producer = this.createProducer();
			await producer.connect();
			this.producer = producer;
		} catch (error) {
			// A tap that cannot reach Kafka at all stays off for the life of the
			// process rather than re-dialling on every deduction.
			this.disable({ error });
		} finally {
			this.connecting = null;
		}
	}

	private disable({ error }: { error: unknown }): void {
		this.disabled = true;
		this.warn({ message: "disabled after connect failure", error });
		void this.shutdown();
	}

	/** One warn per window per process, not one per dropped event: a broker
	 *  outage would otherwise turn every deduction into a log line. */
	private warn({ message, error }: { message: string; error: unknown }): void {
		const now = Date.now();
		if (this.lastWarnAtMs !== 0 && now - this.lastWarnAtMs < WARN_INTERVAL_MS) {
			return;
		}
		this.lastWarnAtMs = now;

		try {
			this.onWarn({
				message,
				error,
				dropped: this.droppedCount,
				queueDepth: this.queue.length,
			});
		} catch {
			// Even the warn path must not surface into the serving path.
		}
	}
}

const createKafkaProducer = ({
	config,
}: {
	config: ShadowTapConfig;
}): ShadowProducer => {
	const kafka = new Kafka({
		clientId: config.clientId,
		brokers: config.brokers,
		ssl: true,
		logLevel: logLevel.WARN,
		sasl: {
			mechanism: "oauthbearer",
			oauthBearerProvider: async () => {
				const { token } = await generateAuthToken({ region: config.region });
				return { value: token };
			},
		},
	});

	return kafka.producer();
};

let cachedTap: ShadowTap | null = null;
let resolved = false;

const getShadowTap = (): ShadowTap | null => {
	if (resolved) return cachedTap;
	resolved = true;

	const config = readShadowTapConfig();
	if (!config) return null;

	const tap = new ShadowTap({
		config,
		createProducer: () => createKafkaProducer({ config }),
	});
	for (const signal of ["SIGTERM", "SIGINT"] as const) {
		process.once(signal, () => void tap.shutdown());
	}

	cachedTap = tap;
	return tap;
};

/**
 * Mirrors one committed deduction into the metering topic. Returns immediately
 * and never throws: with the tap off (the default) it is a bare no-op.
 */
export const shadowTapDeduct = (params: ShadowDeductParams): void => {
	try {
		getShadowTap()?.record(params);
	} catch {
		// The mirror is never allowed to affect the request that fed it.
	}
};

export const resetShadowTapForTests = async (): Promise<void> => {
	const tap = cachedTap;
	cachedTap = null;
	resolved = false;
	await tap?.shutdown();
};
