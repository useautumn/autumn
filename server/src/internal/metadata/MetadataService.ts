import {
	type Metadata,
	type MetadataInsert,
	type MetadataType,
	metadata,
} from "@autumn/shared";
import { and, eq } from "drizzle-orm";
import type { DrizzleCli } from "@/db/initDrizzle.js";

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

		return data[0] as Metadata;
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

		return meta as Metadata;
	}

	static async delete({ db, id }: { db: DrizzleCli; id: string }) {
		await db.delete(metadata).where(eq(metadata.id, id));
	}
}
