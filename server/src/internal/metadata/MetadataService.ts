import {
	type Metadata,
	type MetadataInsert,
	type MetadataType,
	metadata,
} from "@autumn/shared";
import { and, eq } from "drizzle-orm";
import type { DrizzleCli } from "@/db/initDrizzle.js";
import { backfillProductVersionIdentityInTree } from "@/internal/products/productUtils/backfillProductVersionIdentity.js";

const hydrateMetadataRow = (row: Metadata): Metadata => {
	if (row.data) {
		backfillProductVersionIdentityInTree({ value: row.data });
	}
	return row;
};

/**
 * MetadataService handles CRUD operations for the metadata table.
 */
export class MetadataService {
	static async insert({ db, data }: { db: DrizzleCli; data: MetadataInsert }) {
		const insertedMetadata = await db.insert(metadata).values(data).returning();

		return insertedMetadata[0] as Metadata;
	}

	static async get({ db, id }: { db: DrizzleCli; id: string }) {
		const data = await db
			.select()
			.from(metadata)
			.where(eq(metadata.id, id))
			.limit(1);

		if (data.length === 0) {
			return null;
		}

		return hydrateMetadataRow(data[0] as Metadata);
	}

	static async getByStripeInvoiceId({
		db,
		stripeInvoiceId,
		type,
	}: {
		db: DrizzleCli;
		stripeInvoiceId: string;
		type?: MetadataType;
	}) {
		const meta = await db.query.metadata.findFirst({
			where: and(
				eq(metadata.stripe_invoice_id, stripeInvoiceId),
				type ? eq(metadata.type, type) : undefined,
			),
		});

		if (!meta) {
			return null;
		}

		return hydrateMetadataRow(meta as Metadata);
	}

	/**
	 * Atomically transitions a metadata row from one type to another.
	 * Returns true only for the caller whose update matched the `fromType`
	 * predicate — concurrent executors racing on the same row get false.
	 */
	static async claim({
		db,
		id,
		fromType,
		toType,
	}: {
		db: DrizzleCli;
		id: string;
		fromType: MetadataType;
		toType: MetadataType;
	}): Promise<boolean> {
		const claimedRows = await db
			.update(metadata)
			.set({ type: toType })
			.where(and(eq(metadata.id, id), eq(metadata.type, fromType)))
			.returning({ id: metadata.id });

		return claimedRows.length > 0;
	}

	static async delete({ db, id }: { db: DrizzleCli; id: string }) {
		await db.delete(metadata).where(eq(metadata.id, id));
	}

	static async update({
		db,
		id,
		updates,
	}: {
		db: DrizzleCli;
		id: string;
		updates: Partial<MetadataInsert>;
	}) {
		const updatedMetadata = await db
			.update(metadata)
			.set(updates)
			.where(eq(metadata.id, id))
			.returning();

		return updatedMetadata[0] as Metadata | undefined;
	}
}
