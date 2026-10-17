import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { createPostgresClient } from "../../../src/createPostgresClient.js";
import {
	claimPartitionProgress,
	epochClaimToken,
} from "../../../src/meteringLog/repos/partitionProgress.js";
import type { PostgresClient } from "../../../src/types/postgresClient.js";

const databaseUrl = process.env.FLUSH_TEST_DATABASE_URL;

const topic = "metering";
const partition = 3;

describe.skipIf(!databaseUrl)(
	"claimPartitionProgress: claims are monotonic by owner epoch",
	() => {
		let postgres: PostgresClient;

		beforeAll(async () => {
			postgres = createPostgresClient({
				ctx: { logger: console },
				config: {
					databaseUrl: databaseUrl as string,
					applicationName: "partition-claim-test",
					maxConnections: 2,
					minConnections: 0,
					connectTimeoutMs: 10_000,
					idleTimeoutMs: 30_000,
					queryTimeoutMs: 30_000,
					statementTimeoutMs: null,
				},
			});
			await postgres.client.query(`
				DROP TABLE IF EXISTS partition_progress;
				CREATE TABLE partition_progress (
					topic text NOT NULL,
					partition_id integer NOT NULL,
					next_offset bigint NOT NULL,
					command_next_offset bigint,
					owner_epoch bigint,
					owner_fence_offset bigint,
					claim_token text,
					PRIMARY KEY (topic, partition_id)
				)`);
		});

		afterAll(async () => {
			await postgres?.close();
		});

		const seed = async ({
			claimToken = null,
			ownerEpoch = null,
		}: {
			claimToken?: string | null;
			ownerEpoch?: bigint | null;
		} = {}) => {
			await postgres.client.query("TRUNCATE partition_progress");
			await postgres.client.query(
				"INSERT INTO partition_progress (topic, partition_id, next_offset, claim_token, owner_epoch) VALUES ($1, $2, 40, $3, $4)",
				[topic, partition, claimToken, ownerEpoch?.toString() ?? null],
			);
		};

		const storedToken = async () =>
			(
				await postgres.client.query(
					"SELECT claim_token FROM partition_progress WHERE topic = $1 AND partition_id = $2",
					[topic, partition],
				)
			).rows[0]?.claim_token as string | null | undefined;

		const claim = ({ ownerEpoch, id }: { ownerEpoch: bigint; id: string }) => {
			const claimToken = epochClaimToken({ ownerEpoch, id });
			return {
				claimToken,
				result: claimPartitionProgress({
					ctx: { db: postgres.db },
					topic,
					partition,
					claimToken,
					ownerEpoch,
				}),
			};
		};

		test("a newer owner's claim wins over an older owner's that lands later", async () => {
			await seed();
			const successor = claim({ ownerEpoch: 200n, id: "successor" });
			expect(await successor.result).toBe(true);
			const delayed = claim({ ownerEpoch: 100n, id: "old" });
			expect(await delayed.result).toBe(false);
			expect(await storedToken()).toBe(successor.claimToken);
		});

		test("an older claim that lands first is replaced by the newer one", async () => {
			await seed();
			expect(await claim({ ownerEpoch: 100n, id: "old" }).result).toBe(true);
			const successor = claim({ ownerEpoch: 200n, id: "successor" });
			expect(await successor.result).toBe(true);
			expect(await storedToken()).toBe(successor.claimToken);
		});

		test("a legacy token without an epoch is replaced", async () => {
			await seed({ claimToken: crypto.randomUUID() });
			const next = claim({ ownerEpoch: 100n, id: "next" });
			expect(await next.result).toBe(true);
			expect(await storedToken()).toBe(next.claimToken);
		});

		test("a null token is replaced", async () => {
			await seed();
			const next = claim({ ownerEpoch: 100n, id: "next" });
			expect(await next.result).toBe(true);
			expect(await storedToken()).toBe(next.claimToken);
		});

		test("a claim at the stored token's own epoch replaces it", async () => {
			await seed();
			expect(await claim({ ownerEpoch: 100n, id: "first" }).result).toBe(true);
			const again = claim({ ownerEpoch: 100n, id: "again" });
			expect(await again.result).toBe(true);
			expect(await storedToken()).toBe(again.claimToken);
		});

		test("a claim is refused when the partition's recorded owner epoch is newer", async () => {
			const held = epochClaimToken({ ownerEpoch: 50n, id: "held" });
			await seed({ claimToken: held, ownerEpoch: 200n });
			expect(await claim({ ownerEpoch: 100n, id: "late" }).result).toBe(false);
			expect(await storedToken()).toBe(held);
		});

		test("a claim at the recorded owner epoch is taken", async () => {
			await seed({ ownerEpoch: 100n });
			const next = claim({ ownerEpoch: 100n, id: "next" });
			expect(await next.result).toBe(true);
			expect(await storedToken()).toBe(next.claimToken);
		});

		test("a partition with no row yet is not refused", async () => {
			await postgres.client.query("TRUNCATE partition_progress");
			expect(await claim({ ownerEpoch: 100n, id: "first" }).result).toBe(true);
			expect(await storedToken()).toBeUndefined();
		});

		test("epochs order numerically, not as text", async () => {
			await seed();
			expect(await claim({ ownerEpoch: 9n, id: "nine" }).result).toBe(true);
			const ten = claim({ ownerEpoch: 10n, id: "ten" });
			expect(await ten.result).toBe(true);
			expect(await claim({ ownerEpoch: 9n, id: "late" }).result).toBe(false);
			expect(await storedToken()).toBe(ten.claimToken);
		});
	},
);
