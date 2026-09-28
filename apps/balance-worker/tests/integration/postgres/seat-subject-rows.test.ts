import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { getSubjectRows, type PostgresClient } from "@autumn/postgres";
import { sql } from "drizzle-orm";
import {
	openFixturePostgres,
	readWorktreeDatabaseUrl,
	type SeededCustomer,
	seedCustomer,
	seedLicensePool,
	seedPool,
	seedSeat,
} from "./postgresCustomerFixture.js";

const databaseUrl = readWorktreeDatabaseUrl();

describe.skipIf(!databaseUrl)("seat subject rows", () => {
	let postgres: PostgresClient;

	beforeAll(() => {
		if (!databaseUrl) throw new Error("No worktree DATABASE_URL");
		postgres = openFixturePostgres({ databaseUrl });
	});

	afterAll(async () => {
		await postgres?.close();
	});

	const loadEntity = async ({
		seeded,
		entityId,
	}: {
		seeded: SeededCustomer;
		entityId: string;
	}) => {
		const envelope = await getSubjectRows({
			ctx: { db: postgres.db, orgId: seeded.orgId, env: seeded.env },
			customerId: seeded.identity.customerId,
			entityId,
			asOfTimestampMs: Date.now(),
		});
		if (!envelope) throw new Error("entity not found");
		return {
			productIds: envelope.customer_products.map(({ id }) => id),
			entitlementIds: envelope.customer_entitlements.map(({ id }) => id),
		};
	};

	const setParentStatus = ({
		seeded,
		status,
	}: {
		seeded: SeededCustomer;
		status: string;
	}) =>
		postgres.db.execute(
			sql`UPDATE customer_products SET status = ${status} WHERE id = ${seeded.customerProductId}`,
		);

	test("a seat loads with its grant while its license parent is live, even when its own status column is stale", async () => {
		const seeded = await seedCustomer({ postgres });
		const license = await seedLicensePool({ postgres, seeded });
		const seat = await seedSeat({
			postgres,
			seeded,
			linkId: license.linkId,
			seatStatus: "expired",
		});
		try {
			expect(await loadEntity({ seeded, entityId: seat.entityId })).toEqual({
				productIds: [seat.customerProductId],
				entitlementIds: [seat.customerEntitlementId],
			});
		} finally {
			await seat.cleanup();
			await license.cleanup();
			await seeded.cleanup();
		}
	});

	test("a seat whose license parent expired is left out, whatever its own status column says", async () => {
		const seeded = await seedCustomer({ postgres });
		const license = await seedLicensePool({ postgres, seeded });
		const seat = await seedSeat({
			postgres,
			seeded,
			linkId: license.linkId,
			seatStatus: "active",
		});
		try {
			await setParentStatus({ seeded, status: "expired" });
			expect(await loadEntity({ seeded, entityId: seat.entityId })).toEqual({
				productIds: [],
				entitlementIds: [],
			});
		} finally {
			await seat.cleanup();
			await license.cleanup();
			await seeded.cleanup();
		}
	});

	const loadCustomer = async ({ seeded }: { seeded: SeededCustomer }) => {
		const envelope = await getSubjectRows({
			ctx: { db: postgres.db, orgId: seeded.orgId, env: seeded.env },
			customerId: seeded.identity.customerId,
			asOfTimestampMs: Date.now(),
		});
		if (!envelope) throw new Error("customer not found");
		return {
			productIds: envelope.customer_products.map(({ id }) => id),
			entitlementIds: envelope.customer_entitlements.map(({ id }) => id),
		};
	};

	const loadCustomerPools = async ({ seeded }: { seeded: SeededCustomer }) => {
		const envelope = await getSubjectRows({
			ctx: { db: postgres.db, orgId: seeded.orgId, env: seeded.env },
			customerId: seeded.identity.customerId,
			asOfTimestampMs: Date.now(),
		});
		if (!envelope) throw new Error("customer not found");
		return envelope.pooled_balances.map(({ id }) => id);
	};

	test("a license pool loads on the customer while its parent is live, and drops out once the parent expires", async () => {
		const seeded = await seedCustomer({ postgres });
		const license = await seedLicensePool({ postgres, seeded });
		const pool = await seedPool({
			postgres,
			customer: seeded,
			granted: 50,
			balance: 50,
			nextResetAt: Date.now() + 60_000,
			contributions: [],
			customerLicenseLinkId: license.linkId,
		});
		try {
			expect(await loadCustomerPools({ seeded })).toEqual([
				pool.pooledBalanceId,
			]);
			await setParentStatus({ seeded, status: "expired" });
			expect(await loadCustomerPools({ seeded })).toEqual([]);
		} finally {
			await pool.cleanup();
			await license.cleanup();
			await seeded.cleanup();
		}
	});

	test("a spare seat, held by no entity, stays out of the customer's rows though its parent is live", async () => {
		const seeded = await seedCustomer({ postgres });
		const license = await seedLicensePool({ postgres, seeded });
		const seat = await seedSeat({
			postgres,
			seeded,
			linkId: license.linkId,
			seatStatus: "active",
			spare: true,
		});
		try {
			expect(await loadCustomer({ seeded })).toEqual({
				productIds: [seeded.customerProductId],
				entitlementIds: [seeded.customerEntitlementId],
			});
		} finally {
			await seat.cleanup();
			await license.cleanup();
			await seeded.cleanup();
		}
	});

	test("a seat linked to no license of the customer is left out", async () => {
		const seeded = await seedCustomer({ postgres });
		const seat = await seedSeat({
			postgres,
			seeded,
			linkId: "link_missing",
			seatStatus: "active",
		});
		try {
			expect(await loadEntity({ seeded, entityId: seat.entityId })).toEqual({
				productIds: [],
				entitlementIds: [],
			});
		} finally {
			await seat.cleanup();
			await seeded.cleanup();
		}
	});
});
