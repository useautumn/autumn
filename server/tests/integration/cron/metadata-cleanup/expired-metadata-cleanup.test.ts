import { expect, test } from "bun:test";
import { type MetadataInsert, MetadataType, metadata } from "@autumn/shared";
import ctx from "@tests/utils/testInitUtils/createTestContext";
import chalk from "chalk";
import { addDays } from "date-fns";
import { inArray } from "drizzle-orm";
import { deleteExpiredCheckoutMetadata } from "@/internal/metadata/actions/deleteExpiredCheckoutMetadata";
import { MetadataService } from "@/internal/metadata/MetadataService";
import { generateId } from "@/utils/genUtils";

// Rows sit near the epoch so the sweep's cutoff never reaches rows other tests create.
const NOW = addDays(0, 31).getTime() + 1_000;

const insertRow = async ({
	type,
	expiresAt,
}: {
	type: MetadataType;
	expiresAt: number;
}) => {
	const row: MetadataInsert = {
		id: generateId("meta"),
		created_at: 0,
		expires_at: expiresAt,
		type,
	};
	await MetadataService.insert({ db: ctx.db, data: row });
	return row.id;
};

test(`${chalk.yellowBright("expired metadata cleanup: deletes only checkout_session_completed rows 31+ days past expiry")}`, async () => {
	const purgeable = await insertRow({
		type: MetadataType.CheckoutSessionCompleted,
		expiresAt: 500,
	});
	const withinRetention = await insertRow({
		type: MetadataType.CheckoutSessionCompleted,
		expiresAt: 5_000,
	});
	const otherType = await insertRow({
		type: MetadataType.CheckoutSessionV2,
		expiresAt: 500,
	});
	const deferredInvoice = await insertRow({
		type: MetadataType.DeferredInvoice,
		expiresAt: 500,
	});
	const ids = [purgeable, withinRetention, otherType, deferredInvoice];

	try {
		const { deleted } = await deleteExpiredCheckoutMetadata({ ctx, now: NOW });
		expect(deleted).toBe(1);

		const remaining = await ctx.db
			.select({ id: metadata.id })
			.from(metadata)
			.where(inArray(metadata.id, ids));
		expect(remaining.map((row) => row.id).sort()).toEqual(
			[withinRetention, otherType, deferredInvoice].sort(),
		);
	} finally {
		await ctx.db.delete(metadata).where(inArray(metadata.id, ids));
	}
});

test(`${chalk.yellowBright("expired metadata cleanup: deletes at most 1,000 rows per call")}`, async () => {
	const rows: MetadataInsert[] = Array.from({ length: 1_001 }, () => ({
		id: generateId("meta"),
		created_at: 0,
		expires_at: 500,
		type: MetadataType.CheckoutSessionCompleted,
	}));
	const ids = rows.map((row) => row.id as string);
	await ctx.db.insert(metadata).values(rows);

	try {
		const first = await deleteExpiredCheckoutMetadata({ ctx, now: NOW });
		expect(first.deleted).toBe(1_000);

		const second = await deleteExpiredCheckoutMetadata({ ctx, now: NOW });
		expect(second.deleted).toBe(1);
	} finally {
		await ctx.db.delete(metadata).where(inArray(metadata.id, ids));
	}
});
