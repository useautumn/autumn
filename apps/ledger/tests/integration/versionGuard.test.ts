import { afterAll, beforeAll, describe, expect, it } from "bun:test";
import {
	createPostgresDb,
	ledgerSubjectVersionRepo,
	type PostgresDb,
} from "@autumn/postgres";
import { schemas } from "@autumn/shared";
import { eq } from "drizzle-orm";
import { classifyVersionGuard } from "../../src/internal/projector/classifyVersionGuard.js";

const databaseUrl = process.env.DATABASE_URL;
const INTERNAL_CUSTOMER_ID = `icus_guard_${Date.now()}`;
const PARTITION = 7;

const advance = ({ db, version }: { db: PostgresDb; version: number }) =>
	ledgerSubjectVersionRepo.advanceVersion({
		db,
		internalCustomerId: INTERNAL_CUSTOMER_ID,
		version,
		partition: PARTITION,
		kafkaOffset: version * 10,
	});

const verdictFor = async ({
	db,
	version,
}: {
	db: PostgresDb;
	version: number;
}) =>
	classifyVersionGuard({
		entryVersion: version,
		storedVersion: await ledgerSubjectVersionRepo.getVersion({
			db,
			internalCustomerId: INTERNAL_CUSTOMER_ID,
		}),
	});

describe.skipIf(!databaseUrl)("advanceVersion", () => {
	let postgres: ReturnType<typeof createPostgresDb>;

	beforeAll(() => {
		postgres = createPostgresDb({
			databaseUrl: databaseUrl ?? "",
			name: "ledger-guard-it",
		});
	});

	afterAll(async () => {
		await postgres.db
			.delete(schemas.ledgerSubjectVersions)
			.where(
				eq(
					schemas.ledgerSubjectVersions.internal_customer_id,
					INTERNAL_CUSTOMER_ID,
				),
			);
		await postgres.client.end();
	});

	it("refuses to open a subject at anything but the first version", async () => {
		const db = postgres.db;

		expect(await advance({ db, version: 4 })).toBe(false);
		expect(await verdictFor({ db, version: 4 })).toBe("gap");
	});

	it("opens at v1, advances one at a time, and rejects both re-plays and gaps", async () => {
		const db = postgres.db;

		expect(await advance({ db, version: 1 })).toBe(true);
		expect(await advance({ db, version: 2 })).toBe(true);

		// Re-delivery of an entry the cursor already passed.
		expect(await advance({ db, version: 1 })).toBe(false);
		expect(await verdictFor({ db, version: 1 })).toBe("duplicate");
		expect(await advance({ db, version: 2 })).toBe(false);
		expect(await verdictFor({ db, version: 2 })).toBe("duplicate");

		// An entry that skips one: applying it would silently lose a fold.
		expect(await advance({ db, version: 4 })).toBe(false);
		expect(await verdictFor({ db, version: 4 })).toBe("gap");

		const [row] = await db
			.select()
			.from(schemas.ledgerSubjectVersions)
			.where(
				eq(
					schemas.ledgerSubjectVersions.internal_customer_id,
					INTERNAL_CUSTOMER_ID,
				),
			);
		expect(row.version).toBe(2);
		expect(row.partition).toBe(PARTITION);
		expect(row.kafka_offset).toBe(20);
	});
});
