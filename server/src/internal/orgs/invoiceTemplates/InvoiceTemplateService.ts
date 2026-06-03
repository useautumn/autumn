import {
	type InvoiceTemplate,
	type InvoiceTemplateRow,
	invoiceTemplates,
} from "@autumn/shared";
import type { DrizzleCli } from "@server/db/initDrizzle";
import { and, desc, eq } from "drizzle-orm";

const toApi = (row: InvoiceTemplateRow): InvoiceTemplate => ({
	id: row.id ?? row.internal_id,
	name: row.name ?? "",
	footer: row.footer ?? undefined,
	memo: row.memo ?? undefined,
	net_terms_days: row.net_terms_days ?? undefined,
	created_at: row.created_at ?? undefined,
});

interface InvoiceTemplateValues {
	name: string;
	footer?: string;
	memo?: string;
	net_terms_days?: number;
}

export class InvoiceTemplateService {
	static async list({
		db,
		orgId,
	}: {
		db: DrizzleCli;
		orgId: string;
	}): Promise<InvoiceTemplate[]> {
		const rows = await db
			.select()
			.from(invoiceTemplates)
			.where(eq(invoiceTemplates.org_id, orgId))
			.orderBy(desc(invoiceTemplates.created_at));
		return rows.map(toApi);
	}

	static async getById({
		db,
		orgId,
		id,
	}: {
		db: DrizzleCli;
		orgId: string;
		id: string;
	}): Promise<InvoiceTemplate | undefined> {
		const rows = await db
			.select()
			.from(invoiceTemplates)
			.where(
				and(eq(invoiceTemplates.org_id, orgId), eq(invoiceTemplates.id, id)),
			)
			.limit(1);
		const row = rows[0];
		return row ? toApi(row) : undefined;
	}

	static async create({
		db,
		orgId,
		internalId,
		id,
		values,
	}: {
		db: DrizzleCli;
		orgId: string;
		internalId: string;
		id: string;
		values: InvoiceTemplateValues;
	}): Promise<InvoiceTemplate> {
		const rows = await db
			.insert(invoiceTemplates)
			.values({
				internal_id: internalId,
				id,
				org_id: orgId,
				created_at: Date.now(),
				...values,
			})
			.returning();
		return toApi(rows[0]);
	}

	static async update({
		db,
		orgId,
		id,
		update,
	}: {
		db: DrizzleCli;
		orgId: string;
		id: string;
		update: InvoiceTemplateValues;
	}): Promise<InvoiceTemplate | undefined> {
		const rows = await db
			.update(invoiceTemplates)
			.set(update)
			.where(
				and(eq(invoiceTemplates.org_id, orgId), eq(invoiceTemplates.id, id)),
			)
			.returning();
		const row = rows[0];
		return row ? toApi(row) : undefined;
	}

	static async delete({
		db,
		orgId,
		id,
	}: {
		db: DrizzleCli;
		orgId: string;
		id: string;
	}): Promise<void> {
		await db
			.delete(invoiceTemplates)
			.where(
				and(eq(invoiceTemplates.org_id, orgId), eq(invoiceTemplates.id, id)),
			);
	}
}
