import { sql } from "drizzle-orm";
import type { DrizzleCli } from "@/db/initDrizzle.js";

export type CustomerLicenseBalanceRow = {
	id: string;
	granted: number;
	remaining: number;
	plan_license_id: string | null;
};

/** Batch balance write: every drifted row for a customer in one UPDATE via a
 * VALUES join, instead of a round trip per row. */
export const updateCustomerLicenseBalances = async ({
	db,
	rows,
}: {
	db: DrizzleCli;
	rows: CustomerLicenseBalanceRow[];
}) => {
	if (rows.length === 0) return;
	const values = sql.join(
		rows.map(
			(row) =>
				sql`(${row.id}, ${row.granted}, ${row.remaining}, ${row.plan_license_id})`,
		),
		sql`, `,
	);
	await db.execute(sql`
		UPDATE customer_licenses AS cl
		SET
			granted = (v.granted)::numeric,
			remaining = (v.remaining)::numeric,
			plan_license_id = v.plan_license_id,
			updated_at = ${Date.now()}
		FROM (VALUES ${values}) AS v(id, granted, remaining, plan_license_id)
		WHERE cl.id = v.id
	`);
};
