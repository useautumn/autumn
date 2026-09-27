import { type SQL, sql } from "drizzle-orm";
import { z } from "zod";
import type { HourWindow } from "../../types/hourWindow";
import type { PostgresDb } from "../../types/postgresDb";
import type { PaidInvoice } from "../types/paidInvoice";

const paidInvoiceRowSchema = z.object({
	id: z.string().min(1),
	stripe_id: z.string(),
	processor_type: z.string().nullable(),
	currency: z.string().min(1),
	paid_at: z.coerce.number(),
	amount: z.coerce.number(),
	org_id: z.string().min(1),
	org_slug: z.string().default(""),
});

const paidInWindow = (window: HourWindow): SQL =>
	sql`(i.paid_at >= ${window.startMs} AND i.paid_at < ${window.endMs})`;

/**
 * Billing volume is money collected from live customers: `paid_at` set (Stripe and RevenueCat
 * write it, `invoices.insert` never does), `amount_paid` when known else `total`.
 */
export const paidInvoicesSql = ({
	windows,
}: {
	windows: HourWindow[];
}): SQL => sql`
	SELECT i.id, i.stripe_id, i.processor_type, i.currency,
		i.paid_at::float8 AS paid_at,
		COALESCE(i.amount_paid, i.total)::float8 AS amount,
		c.org_id, o.slug AS org_slug
	FROM invoices i
	JOIN customers c ON c.internal_id = i.internal_customer_id
	JOIN organizations o ON o.id = c.org_id
	WHERE (${sql.join(windows.map(paidInWindow), sql` OR `)})
		AND c.env = 'live'
	ORDER BY i.paid_at, i.id
`;

const rowToPaidInvoice = (row: unknown): PaidInvoice => {
	const parsed = paidInvoiceRowSchema.safeParse(row);
	if (!parsed.success) {
		const keys = row && typeof row === "object" ? Object.keys(row) : [];
		throw new Error(
			`Unexpected paid invoice row (keys: ${keys.join(", ")}): ${parsed.error.message}`,
		);
	}
	return {
		id: parsed.data.id,
		stripeId: parsed.data.stripe_id,
		processorType: parsed.data.processor_type,
		orgId: parsed.data.org_id,
		orgSlug: parsed.data.org_slug,
		currency: parsed.data.currency,
		amount: parsed.data.amount,
		paidAtMs: parsed.data.paid_at,
	};
};

/** Every invoice paid by a live customer within the given hours. */
export const listPaidInvoices = async ({
	ctx,
	windows,
}: {
	ctx: { db: PostgresDb };
	windows: HourWindow[];
}): Promise<PaidInvoice[]> => {
	if (windows.length === 0) return [];
	const rows = await ctx.db.execute(paidInvoicesSql({ windows }));
	return rows.map(rowToPaidInvoice);
};
