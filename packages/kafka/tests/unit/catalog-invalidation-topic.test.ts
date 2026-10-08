import { describe, expect, test } from "bun:test";
import type { ConsumerConfig, ProducerRecord } from "kafkajs";
import {
	createCatalogInvalidationConsumer,
	createCatalogInvalidationPublisher,
	InvalidRecordError,
	parseCatalogInvalidationRecord,
	RecordKeyMismatchError,
	serializeCatalogInvalidationRecord,
} from "../../src/kafka.js";

const record = {
	schemaVersion: 1 as const,
	type: "invalidated" as const,
	orgId: "org_1",
	env: "live",
	at: 1_700_000_000_000,
};

describe("catalog invalidation topic", () => {
	test("a record round-trips, keyed by org and env", () => {
		const serialized = serializeCatalogInvalidationRecord({ record });

		expect(serialized.key.toString("utf8")).toBe("org_1:live");
		expect(parseCatalogInvalidationRecord(serialized)).toEqual(record);
	});

	test("a record under another key is refused", () => {
		const { value } = serializeCatalogInvalidationRecord({ record });

		expect(() =>
			parseCatalogInvalidationRecord({ key: Buffer.from("org_2:live"), value }),
		).toThrow(RecordKeyMismatchError);
	});

	test("a record from a newer writer reads with its unknown field kept", () => {
		const newer = { ...record, futureField: true };
		const serialized = serializeCatalogInvalidationRecord({ record: newer });

		expect(parseCatalogInvalidationRecord(serialized)).toEqual(newer);
	});

	test("an envelope of another type is refused", () => {
		const value = Buffer.from(
			JSON.stringify({ schemaVersion: 1, type: "claimed", payload: record }),
		);

		expect(() =>
			parseCatalogInvalidationRecord({ key: Buffer.from("org_1:live"), value }),
		).toThrow(InvalidRecordError);
	});

	test("the publisher sends one acknowledged message per invalidation", async () => {
		const sent: ProducerRecord[] = [];
		const publisher = createCatalogInvalidationPublisher({
			ctx: {
				topic: "local-catalog-invalidations",
				producer: {
					async send(producerRecord: ProducerRecord) {
						sent.push(producerRecord);
						return [];
					},
				},
			},
		});

		await publisher.publish({ orgId: "org_1", env: "live", at: record.at });

		expect(sent).toHaveLength(1);
		expect(sent[0]?.acks).toBe(-1);
		const [message] = sent[0]?.messages ?? [];
		expect(
			parseCatalogInvalidationRecord({
				key: message?.key as Buffer,
				value: message?.value as Buffer,
			}),
		).toEqual(record);
	});

	test("the consumer applies what it can read and skips what it cannot, in order", async () => {
		const applied: string[] = [];
		const skipped: string[] = [];
		let run:
			| ((payload: {
					message: { offset: string; key: Buffer | null; value: Buffer | null };
			  }) => Promise<void>)
			| undefined;
		let groupConfig: ConsumerConfig | undefined;
		const consumer = createCatalogInvalidationConsumer({
			ctx: {
				kafka: {
					consumer: (config: ConsumerConfig) => {
						groupConfig = config;
						return {
							connect: async () => {},
							subscribe: async () => {},
							run: async (runConfig: { eachMessage?: typeof run }) => {
								run = runConfig.eachMessage;
							},
							on: () => () => {},
							events: { GROUP_JOIN: "consumer.group_join" },
							disconnect: async () => {},
						} as never;
					},
				},
				handler: {
					apply: ({ record: read }) => {
						applied.push(`${read.orgId}:${read.env}`);
					},
					skip: ({ offset }) => {
						skipped.push(offset);
					},
				},
			},
			config: {
				topic: "local-catalog-invalidations",
				group: { kind: "perProcess", idPrefix: "test" },
			},
		});

		await consumer.start();
		expect(groupConfig).toMatchObject({
			readUncommitted: false,
			allowAutoTopicCreation: false,
			maxWaitTimeInMs: 5_000,
		});
		await run?.({
			message: {
				offset: "0",
				...serializeCatalogInvalidationRecord({ record }),
			},
		});
		await run?.({
			message: { offset: "1", key: null, value: Buffer.from("{") },
		});
		await run?.({
			message: {
				offset: "2",
				...serializeCatalogInvalidationRecord({
					record: { ...record, orgId: "org_2" },
				}),
			},
		});

		expect(applied).toEqual(["org_1:live", "org_2:live"]);
		expect(skipped).toEqual(["1"]);
	});

	test("a per-process group commits nothing and resumes from what it read after a rejoin; a shared group keeps committing", async () => {
		type RunConfig = {
			autoCommit?: boolean;
			eachMessage?: (payload: {
				topic: string;
				partition: number;
				message: { offset: string; key: Buffer | null; value: Buffer | null };
			}) => Promise<void>;
		};
		function startConsumerIn(
			group:
				| { kind: "perProcess"; idPrefix: string }
				| { kind: "shared"; id: string },
		) {
			const seeks: Array<{ topic: string; partition: number; offset: string }> =
				[];
			const joinListeners: Array<() => void> = [];
			let runConfig: RunConfig | undefined;
			const consumer = createCatalogInvalidationConsumer({
				ctx: {
					kafka: {
						consumer: () =>
							({
								connect: async () => {},
								subscribe: async () => {},
								run: async (config: RunConfig) => {
									runConfig = config;
								},
								on: (_event: string, listener: () => void) => {
									joinListeners.push(listener);
									return () => {};
								},
								events: { GROUP_JOIN: "consumer.group_join" },
								seek: (position: {
									topic: string;
									partition: number;
									offset: string;
								}) => {
									seeks.push(position);
								},
								disconnect: async () => {},
							}) as never,
					},
					handler: { apply: () => {}, skip: () => {} },
				},
				config: { topic: "local-catalog-invalidations", group },
			});
			return {
				consumer,
				seeks,
				readRunConfig: () => runConfig,
				rejoin: () => {
					for (const listener of joinListeners) listener();
				},
			};
		}

		const perProcess = startConsumerIn({
			kind: "perProcess",
			idPrefix: "herald-catalog",
		});
		await perProcess.consumer.start();
		expect(perProcess.readRunConfig()?.autoCommit).toBe(false);
		perProcess.rejoin();
		expect(perProcess.seeks).toEqual([]);
		for (const offset of ["4", "5"])
			await perProcess.readRunConfig()?.eachMessage?.({
				topic: "local-catalog-invalidations",
				partition: 0,
				message: { offset, ...serializeCatalogInvalidationRecord({ record }) },
			});
		perProcess.rejoin();
		expect(perProcess.seeks).toEqual([
			{ topic: "local-catalog-invalidations", partition: 0, offset: "6" },
		]);

		const shared = startConsumerIn({
			kind: "shared",
			id: "herald-catalog-push",
		});
		await shared.consumer.start();
		expect(shared.readRunConfig()?.autoCommit ?? true).toBe(true);
		shared.rejoin();
		expect(shared.seeks).toEqual([]);
	});

	test("a per-process consumer that fails to start leaves no rejoin listener behind", async () => {
		let listeners = 0;
		const consumer = createCatalogInvalidationConsumer({
			ctx: {
				kafka: {
					consumer: () =>
						({
							connect: async () => {},
							subscribe: async () => {},
							run: async () => {
								throw new Error("coordinator unavailable");
							},
							on: () => {
								listeners++;
								return () => {
									listeners--;
								};
							},
							events: { GROUP_JOIN: "consumer.group_join" },
							disconnect: async () => {},
						}) as never,
				},
				handler: { apply: () => {}, skip: () => {} },
			},
			config: {
				topic: "local-catalog-invalidations",
				group: { kind: "perProcess", idPrefix: "herald-catalog" },
			},
		});

		await expect(consumer.start()).rejects.toThrow("coordinator unavailable");
		expect(listeners).toBe(0);
	});

	test("a per-process group is new each time, a shared group is the one named", () => {
		const groupIds: string[] = [];
		const consumerIn = (
			group:
				| { kind: "perProcess"; idPrefix: string }
				| { kind: "shared"; id: string },
		) =>
			createCatalogInvalidationConsumer({
				ctx: {
					kafka: {
						consumer: ({ groupId }) => {
							groupIds.push(groupId);
							return {} as never;
						},
					},
					handler: { apply: () => {}, skip: () => {} },
				},
				config: { topic: "local-catalog-invalidations", group },
			});

		consumerIn({ kind: "perProcess", idPrefix: "herald-catalog" });
		consumerIn({ kind: "perProcess", idPrefix: "herald-catalog" });
		consumerIn({ kind: "shared", id: "herald-catalog-push" });

		const [first, second, shared] = groupIds;
		expect(first).toStartWith("herald-catalog-");
		expect(second).toStartWith("herald-catalog-");
		expect(first).not.toBe(second);
		expect(shared).toBe("herald-catalog-push");
	});
});
