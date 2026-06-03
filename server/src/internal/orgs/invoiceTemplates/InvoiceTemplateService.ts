import {
	type AppEnv,
	type InvoiceTemplate,
	type InvoiceTemplateRow,
	invoiceTemplates,
} from "@autumn/shared";
import type { DrizzleCli } from "@server/db/initDrizzle";
import { and, desc, eq } from "drizzle-orm";

const toApi = (row: InvoiceTemplateRow): InvoiceTemplate => ({
	id: row.id ?? row.internal_id,
	name: row.name ?? "",
	footer: row.footer ?? "",
	created_at: row.created_at ?? undefined,
});

export class InvoiceTemplateService {
	static async list({
		db,
		orgId,
		env,
	}: {
		db: DrizzleCli;
		orgId: string;
		env: AppEnv;
	}): Promise<InvoiceTemplate[]> {
		const rows = await db
			.select()
			.from(invoiceTemplates)
			.where(
				and(eq(invoiceTemplates.org_id, orgId), eq(invoiceTemplates.env, env)),
			)
			.orderBy(desc(invoiceTemplates.created_at));
		return rows.map(toApi);
	}

	static async getById({
		db,
		orgId,
		env,
		id,
	}: {
		db: DrizzleCli;
		orgId: string;
		env: AppEnv;
		id: string;
	}): Promise<InvoiceTemplate | undefined> {
		const rows = await db
			.select()
			.from(invoiceTemplates)
			.where(
				and(
					eq(invoiceTemplates.org_id, orgId),
					eq(invoiceTemplates.env, env),
					eq(invoiceTemplates.id, id),
				),
			)
			.limit(1);
		const row = rows[0];
		return row ? toApi(row) : undefined;
	}

	static async create({
		db,
		orgId,
		env,
		internalId,
		id,
		name,
		footer,
	}: {
		db: DrizzleCli;
		orgId: string;
		env: AppEnv;
		internalId: string;
		id: string;
		name: string;
		footer: string;
	}): Promise<InvoiceTemplate> {
		const rows = await db
			.insert(invoiceTemplates)
			.values({
				internal_id: internalId,
				id,
				org_id: orgId,
				env,
				name,
				footer,
				created_at: Date.now(),
			})
			.returning();
		return toApi(rows[0]);
	}

	static async update({
		db,
		orgId,
		env,
		id,
		update,
	}: {
		db: DrizzleCli;
		orgId: string;
		env: AppEnv;
		id: string;
		update: { name?: string; footer?: string };
	}): Promise<InvoiceTemplate | undefined> {
		const rows = await db
			.update(invoiceTemplates)
			.set(update)
			.where(
				and(
					eq(invoiceTemplates.org_id, orgId),
					eq(invoiceTemplates.env, env),
					eq(invoiceTemplates.id, id),
				),
			)
			.returning();
		const row = rows[0];
		return row ? toApi(row) : undefined;
	}

	static async delete({
		db,
		orgId,
		env,
		id,
	}: {
		db: DrizzleCli;
		orgId: string;
		env: AppEnv;
		id: string;
	}): Promise<void> {
		await db
			.delete(invoiceTemplates)
			.where(
				and(
					eq(invoiceTemplates.org_id, orgId),
					eq(invoiceTemplates.env, env),
					eq(invoiceTemplates.id, id),
				),
			);
	}
}
