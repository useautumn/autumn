import { afterAll, beforeAll, describe, expect, it } from "bun:test";
import { createPostgresDb } from "@autumn/postgres";
import { AppEnv, schemas } from "@autumn/shared";
import { eq } from "drizzle-orm";
import type { Command } from "../../src/api/types/command.js";
import { createRedpandaJournal } from "../../src/external/redpanda/createRedpandaJournal.js";
import { createSubjectEventConsumer } from "../../src/external/redpanda/createSubjectEventConsumer.js";
import { runProjector } from "../../src/internal/projector/runProjector.js";
import type { SubjectEventConsumer } from "../../src/internal/projector/types/subjectEventConsumer.js";
import { createShard } from "../../src/internal/shard/createShard.js";
import type { Shard } from "../../src/internal/shard/types/shard.js";
import type { ShardContext } from "../../src/internal/shard/types/shardContext.js";
import { createTestShardContext } from "../unit/testUtils/createTestShardContext.js";
import { seedSubject } from "../unit/testUtils/seedSubject.js";

const brokers =
	process.env.LEDGER_KAFKA_BROKERS?.split(",").map((broker) => broker.trim()) ??
	[];
const databaseUrl = process.env.DATABASE_URL;
const canRun = brokers.length > 0 && Boolean(databaseUrl);

const ORG_ID = "org_projector_it";
const CUSTOMER_ID = `cus_projector_${Date.now()}`;
const INTERNAL_CUSTOMER_ID = `icus_${CUSTOMER_ID}`;
const SHARD_ID = 0;
const POLL_TIMEOUT_MS = 30_000;
const POLL_INTERVAL_MS = 250;

const silentLogger = {
	debug: () => undefined,
	info: () => undefined,
	warn: () => undefined,
	warning: () => undefined,
	error: () => undefined,
	child: () => silentLogger,
} as unknown as ShardContext["logger"];

const trackCommand = (id: string): Command => ({
	id,
	org_id: ORG_ID,
	env: AppEnv.Sandbox,
	customer_id: CUSTOMER_ID,
	at: Date.now(),
	api_version: "1.2",
	kind: "track",
	body: { customer_id: CUSTOMER_ID, feature_id: "messages", value: 5 },
});

const waitFor = async <T>({
	read,
}: {
	read: () => Promise<T | undefined>;
}): Promise<T> => {
	const deadline = Date.now() + POLL_TIMEOUT_MS;
	for (;;) {
		const value = await read();
		if (value !== undefined) return value;
		if (Date.now() > deadline) throw new Error("projection never arrived");
		await Bun.sleep(POLL_INTERVAL_MS);
	}
};

describe.skipIf(!canRun)("projector", () => {
	let shard: Shard;
	let consumer: SubjectEventConsumer;
	let postgres: ReturnType<typeof createPostgresDb>;

	beforeAll(async () => {
		postgres = createPostgresDb({
			databaseUrl: databaseUrl ?? "",
			name: "ledger-projector-it",
		});

		const ctx: ShardContext = {
			...createTestShardContext(),
			shardId: SHARD_ID,
			journal: createRedpandaJournal({
				ctx: { brokers, clientId: "ledger-it", logger: silentLogger },
			}),
		};
		seedSubject({
			ctx,
			orgId: ORG_ID,
			env: AppEnv.Sandbox,
			customerId: CUSTOMER_ID,
			entitlements: [{ featureId: "messages", balance: 100, allowance: 100 }],
		});
		shard = createShard({ ctx });

		consumer = createSubjectEventConsumer({
			ctx: { brokers, clientId: "ledger-projector-it", logger: silentLogger },
			// Its own group: sharing the projector's would eat the real one's work.
			groupId: `ledger-projector-it-${Date.now()}`,
		});
		await runProjector({
			ctx: { postgres: postgres.db, logger: silentLogger },
			consumer,
		});
	});

	afterAll(async () => {
		await shard?.stop();
		await consumer?.stop();
		await postgres?.client.end();
	});

	it("advances ledger_subject_versions for a tracked deduction", async () => {
		const result = await shard.run(trackCommand(`cmd_${CUSTOMER_ID}`));
		expect(result.status).toBe(200);

		const subjectVersion = await waitFor({
			read: async () => {
				const rows = await postgres.db
					.select()
					.from(schemas.ledgerSubjectVersions)
					.where(
						eq(
							schemas.ledgerSubjectVersions.internal_customer_id,
							INTERNAL_CUSTOMER_ID,
						),
					);
				return rows[0];
			},
		});

		expect(subjectVersion.version).toBe(1);
		expect(subjectVersion.partition).toBe(SHARD_ID);
	});
});
