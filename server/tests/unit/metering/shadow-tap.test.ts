import { afterEach, describe, expect, test } from "bun:test";
import { ADMIN_METERING_SHADOW_CONFIG_KEY } from "@/external/aws/s3/adminS3Config.js";
import { parseMeteringEvent } from "@/internal/metering/events/meteringEventSchema.js";
import {
	buildShadowDeductEvent,
	buildShadowDeductEventId,
} from "@/internal/metering/shadow/shadowDeductEvent.js";
import {
	resetShadowTapForTests,
	SHADOW_TAP_QUEUE_CAPACITY,
	type ShadowProducer,
	type ShadowProducerRecord,
	ShadowTap,
	type ShadowTapWarning,
	shadowTapDeduct,
} from "@/internal/metering/shadow/shadowTap.js";
import {
	isOrgTapped,
	readShadowTapConfig,
	type ShadowTapConfig,
	toShadowTapEnablement,
} from "@/internal/metering/shadow/shadowTapConfig.js";
import { createEdgeConfigStore } from "@/internal/misc/edgeConfig/edgeConfigStore.js";
import {
	type MeteringShadowConfig,
	MeteringShadowConfigSchema,
} from "@/internal/misc/meteringShadow/meteringShadowSchemas.js";

const BASE_CONFIG: ShadowTapConfig = {
	brokers: ["b-1.example.amazonaws.com:9098"],
	topic: "metering-events",
	region: "us-east-1",
	clientId: "autumn-metering-shadow-tap-test",
	readEnablement: () =>
		toShadowTapEnablement({ config: { enabled: true, orgs: [] } }),
};

/** Same transport, enablement served from an injected `metering-shadow` config
 *  instead of the real edge config store. */
const configFor = ({
	config,
}: {
	config: MeteringShadowConfig;
}): ShadowTapConfig => ({
	...BASE_CONFIG,
	readEnablement: () => toShadowTapEnablement({ config }),
});

const KAFKA_ENV = { KAFKA_BOOTSTRAP: "b-1:9098" };

const BASE_PARAMS = {
	orgId: "org_1",
	env: "sandbox",
	customerId: "cus_1",
	featureId: "messages",
	value: 3,
	idempotencyKey: "track:req_1",
};

const createFakeProducer = ({
	failConnect = false,
	failSend = false,
}: {
	failConnect?: boolean;
	failSend?: boolean;
} = {}) => {
	const sent: ShadowProducerRecord[] = [];
	const calls = { connect: 0, disconnect: 0 };

	const producer: ShadowProducer = {
		async connect() {
			calls.connect++;
			if (failConnect) throw new Error("connect boom");
		},
		async send(record) {
			if (failSend) throw new Error("send boom");
			sent.push(record);
			return [];
		},
		async disconnect() {
			calls.disconnect++;
		},
	};

	return { producer, sent, calls };
};

const createTap = ({
	config = BASE_CONFIG,
	producer,
	warnings,
}: {
	config?: ShadowTapConfig;
	producer: ShadowProducer;
	warnings?: ShadowTapWarning[];
}) =>
	new ShadowTap({
		config,
		createProducer: () => producer,
		onWarn: (warning) => warnings?.push(warning),
	});

const sentEventIds = ({ sent }: { sent: ShadowProducerRecord[] }): string[] =>
	sent.flatMap((record) =>
		record.messages.map(
			(message) => parseMeteringEvent({ input: JSON.parse(message.value) }).id,
		),
	);

const openTaps: ShadowTap[] = [];

const trackTap = (tap: ShadowTap): ShadowTap => {
	openTaps.push(tap);
	return tap;
};

afterEach(async () => {
	while (openTaps.length > 0) {
		await openTaps.pop()?.shutdown();
	}
	await resetShadowTapForTests();
});

describe("shadow tap event mapping", () => {
	test("maps a deduction onto the v1 metering event schema", () => {
		const event = buildShadowDeductEvent({ ...BASE_PARAMS, eventTs: 1234 });

		expect(event).not.toBeNull();
		expect(parseMeteringEvent({ input: event })).toMatchObject({
			v: 1,
			type: "deduct",
			org_id: "org_1",
			env: "sandbox",
			customer_id: "cus_1",
			feature_id: "messages",
			value: 3,
			event_ts: 1234,
		});
	});

	test("the same idempotency key maps to the same event id", () => {
		const first = buildShadowDeductEvent({ ...BASE_PARAMS, eventTs: 1 });
		// A redelivered track re-runs with a different value/timestamp only if the
		// request itself changed; the id must survive both.
		const replay = buildShadowDeductEvent({ ...BASE_PARAMS, eventTs: 99_999 });

		expect(first?.id).toBe(replay?.id as string);
		expect(first?.id).toBe(buildShadowDeductEventId(BASE_PARAMS));
	});

	test("a different request or feature maps to a different event id", () => {
		const base = buildShadowDeductEventId(BASE_PARAMS);

		expect(
			buildShadowDeductEventId({
				...BASE_PARAMS,
				idempotencyKey: "track:req_2",
			}),
		).not.toBe(base);
		expect(
			buildShadowDeductEventId({ ...BASE_PARAMS, featureId: "words" }),
		).not.toBe(base);
		expect(
			buildShadowDeductEventId({ ...BASE_PARAMS, orgId: "org_2" }),
		).not.toBe(base);
		expect(buildShadowDeductEventId({ ...BASE_PARAMS, env: "live" })).not.toBe(
			base,
		);
	});

	test("refunds and empty identifiers never become events", () => {
		expect(buildShadowDeductEvent({ ...BASE_PARAMS, value: 0 })).toBeNull();
		expect(buildShadowDeductEvent({ ...BASE_PARAMS, value: -5 })).toBeNull();
		expect(
			buildShadowDeductEvent({ ...BASE_PARAMS, value: Number.NaN }),
		).toBeNull();
		expect(buildShadowDeductEvent({ ...BASE_PARAMS, orgId: "" })).toBeNull();
		expect(
			buildShadowDeductEvent({ ...BASE_PARAMS, idempotencyKey: "" }),
		).toBeNull();
	});
});

describe("shadow tap configuration", () => {
	test("there is no tap at all without kafka wired up", () => {
		expect(readShadowTapConfig({ env: {} })).toBeNull();
		expect(readShadowTapConfig({ env: { KAFKA_BOOTSTRAP: "  " } })).toBeNull();
		expect(
			readShadowTapConfig({ env: { EVENTS_TOPIC: "metering-events" } }),
		).toBeNull();
	});

	test("reads brokers from env and defaults the topic", () => {
		const config = readShadowTapConfig({
			env: { KAFKA_BOOTSTRAP: " b-1:9098 , b-2:9098 " },
		});

		expect(config?.brokers).toEqual(["b-1:9098", "b-2:9098"]);
		expect(config?.topic).toBe("metering-events-v1");
		expect(
			readShadowTapConfig({
				env: { ...KAFKA_ENV, EVENTS_TOPIC: "metering-events" },
			})?.topic,
		).toBe("metering-events");
	});

	test("enablement and the org allowlist come from the edge config", () => {
		const readEnablementFor = ({ config }: { config: MeteringShadowConfig }) =>
			readShadowTapConfig({
				env: KAFKA_ENV,
				readConfig: () => config,
			})?.readEnablement();

		expect(
			readEnablementFor({ config: { enabled: false, orgs: ["org_a"] } }),
		).toMatchObject({ enabled: false });

		const scoped = readEnablementFor({
			config: { enabled: true, orgs: ["org_a", "org_b"] },
		});
		expect(scoped?.enabled).toBeTrue();
		expect([...(scoped?.allowedOrgIds ?? [])]).toEqual(["org_a", "org_b"]);
	});

	test("an empty or wildcard org list means every org", () => {
		expect(
			toShadowTapEnablement({ config: { enabled: true, orgs: [] } })
				.allowedOrgIds,
		).toBeNull();
		expect(
			toShadowTapEnablement({ config: { enabled: true, orgs: ["*"] } })
				.allowedOrgIds,
		).toBeNull();
		expect(
			toShadowTapEnablement({ config: { enabled: true, orgs: ["  "] } })
				.allowedOrgIds,
		).toBeNull();
	});

	test("shadowTapDeduct is a no-op when the tap is disabled", async () => {
		await resetShadowTapForTests();

		expect(() => shadowTapDeduct(BASE_PARAMS)).not.toThrow();
		expect(shadowTapDeduct(BASE_PARAMS)).toBeUndefined();
	});

	test("an edge config that has not loaded yet keeps the tap a no-op", async () => {
		// A real store that has never refreshed: `get()` serves the default, which
		// is exactly what every process sees before the first S3 poll lands.
		const store = createEdgeConfigStore<MeteringShadowConfig>({
			s3Key: ADMIN_METERING_SHADOW_CONFIG_KEY,
			schema: MeteringShadowConfigSchema,
			defaultValue: () => MeteringShadowConfigSchema.parse({}),
		});
		const { producer, sent, calls } = createFakeProducer();
		const tap = trackTap(
			createTap({
				producer,
				config: {
					...BASE_CONFIG,
					readEnablement: () => toShadowTapEnablement({ config: store.get() }),
				},
			}),
		);

		tap.record(BASE_PARAMS);
		await tap.flushPending();

		expect(tap.queueDepth).toBe(0);
		expect(sent).toHaveLength(0);
		// Nothing queued means no producer is dialled either.
		expect(calls.connect).toBe(0);

		// The enablement is re-read per deduction, so a later load starts mirroring
		// without rebuilding the tap.
		store._setRuntimeConfigForTesting({ enabled: true, orgs: [] });
		tap.record(BASE_PARAMS);
		await tap.flushPending();

		expect(sentEventIds({ sent })).toEqual([
			buildShadowDeductEventId(BASE_PARAMS),
		]);
	});
});

describe("shadow tap delivery", () => {
	test("batches queued deductions to the producer, keyed by customer", async () => {
		const { producer, sent, calls } = createFakeProducer();
		const tap = trackTap(createTap({ producer }));

		tap.record(BASE_PARAMS);
		tap.record({ ...BASE_PARAMS, featureId: "words", value: 7 });
		await tap.flushPending();

		expect(calls.connect).toBe(1);
		expect(sent).toHaveLength(1);
		expect(sent[0].topic).toBe("metering-events");
		expect(sent[0].messages).toHaveLength(2);
		expect(sent[0].messages[0].key).toBe("org_1:cus_1");
		expect(sent[0].messages[0].partition).toBe(sent[0].messages[1].partition);
		expect(tap.queueDepth).toBe(0);

		// The producer is connected once and reused across flushes.
		tap.record({ ...BASE_PARAMS, idempotencyKey: "track:req_2" });
		await tap.flushPending();
		expect(calls.connect).toBe(1);
		expect(sent).toHaveLength(2);
	});

	test("drops events for orgs outside the allowlist", async () => {
		const { producer, sent } = createFakeProducer();
		const tap = trackTap(
			createTap({
				producer,
				config: configFor({ config: { enabled: true, orgs: ["org_1"] } }),
			}),
		);

		tap.record(BASE_PARAMS);
		tap.record({ ...BASE_PARAMS, orgId: "org_2" });

		expect(tap.queueDepth).toBe(1);

		await tap.flushPending();

		expect(sentEventIds({ sent })).toEqual([
			buildShadowDeductEventId(BASE_PARAMS),
		]);
		expect(
			isOrgTapped({
				enablement: BASE_CONFIG.readEnablement(),
				orgId: "anything",
			}),
		).toBeTrue();
	});

	test("drops every event while the config is off", async () => {
		const { producer, sent, calls } = createFakeProducer();
		const tap = trackTap(
			createTap({
				producer,
				config: configFor({ config: { enabled: false, orgs: [] } }),
			}),
		);

		tap.record(BASE_PARAMS);
		await tap.flushPending();

		expect(tap.queueDepth).toBe(0);
		expect(sent).toHaveLength(0);
		expect(calls.connect).toBe(0);
	});

	test("bounded queue drops the oldest events and counts them", async () => {
		const { producer, sent } = createFakeProducer();
		const tap = trackTap(createTap({ producer }));

		const overflowBy = 3;
		for (
			let index = 0;
			index < SHADOW_TAP_QUEUE_CAPACITY + overflowBy;
			index++
		) {
			tap.record({ ...BASE_PARAMS, idempotencyKey: `track:req_${index}` });
		}

		expect(tap.queueDepth).toBe(SHADOW_TAP_QUEUE_CAPACITY);
		expect(tap.dropped).toBe(overflowBy);

		await tap.flushPending();

		const ids = new Set(sentEventIds({ sent }));
		expect(ids.size).toBe(SHADOW_TAP_QUEUE_CAPACITY);
		// Oldest dropped, newest retained.
		expect(
			ids.has(
				buildShadowDeductEventId({
					...BASE_PARAMS,
					idempotencyKey: "track:req_0",
				}),
			),
		).toBeFalse();
		expect(
			ids.has(
				buildShadowDeductEventId({
					...BASE_PARAMS,
					idempotencyKey: `track:req_${SHADOW_TAP_QUEUE_CAPACITY + overflowBy - 1}`,
				}),
			),
		).toBeTrue();
	});

	test("a rejecting producer never reaches the caller", async () => {
		const warnings: ShadowTapWarning[] = [];
		const { producer } = createFakeProducer({ failSend: true });
		const tap = trackTap(createTap({ producer, warnings }));

		expect(() => tap.record(BASE_PARAMS)).not.toThrow();
		await expect(tap.flushPending()).resolves.toBeUndefined();

		// The failed batch is dropped rather than retried forever.
		expect(tap.queueDepth).toBe(0);
		expect(tap.dropped).toBe(1);

		for (let index = 0; index < 20; index++) {
			expect(() =>
				tap.record({ ...BASE_PARAMS, idempotencyKey: `track:req_${index}` }),
			).not.toThrow();
			await tap.flushPending();
		}

		// Rate limited: a broken broker logs once per window, not once per event.
		expect(warnings).toHaveLength(1);
		expect(tap.dropped).toBe(21);
	});

	test("a failed first connect disables the tap instead of throwing", async () => {
		const { producer, calls } = createFakeProducer({ failConnect: true });
		const tap = trackTap(createTap({ producer }));

		tap.record(BASE_PARAMS);
		await tap.flushPending();

		expect(tap.isDisabled).toBeTrue();
		expect(tap.queueDepth).toBe(0);

		// Every later call is a no-op: no re-connect storm, no throw.
		expect(() => tap.record(BASE_PARAMS)).not.toThrow();
		await tap.flushPending();
		expect(calls.connect).toBe(1);
		expect(tap.queueDepth).toBe(0);
	});

	test("a throwing producer factory disables the tap without throwing", async () => {
		const warnings: ShadowTapWarning[] = [];
		const tap = trackTap(
			new ShadowTap({
				config: BASE_CONFIG,
				createProducer: () => {
					throw new Error("factory boom");
				},
				onWarn: (warning) => warnings.push(warning),
			}),
		);

		tap.record(BASE_PARAMS);
		await tap.flushPending();

		expect(tap.isDisabled).toBeTrue();
		expect(warnings).toHaveLength(1);
		expect(() => tap.record(BASE_PARAMS)).not.toThrow();
	});
});
