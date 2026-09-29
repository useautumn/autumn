import type { CustomerWalkCursorFields } from "@autumn/shared";
import { sql } from "drizzle-orm";
import { planetScaleTag } from "@/db/dbUtils.js";
import type { AutumnContext } from "@/honoUtils/HonoEnv.js";
import { customerWalkStartSql } from "./customerWalkSql.js";

/** The last customer this page may walk, or null when the walk ends within the cap. */
export const findCustomerWalkBoundary = async ({
	ctx,
	cursor,
	scanCap,
}: {
	ctx: AutumnContext;
	cursor: CustomerWalkCursorFields | null;
	scanCap: number;
}): Promise<string | null> => {
	const rows = await ctx.db.execute(sql`
		SELECT c.internal_id
		FROM customers c
		WHERE c.org_id = ${ctx.org.id} AND c.env = ${ctx.env}
		${customerWalkStartSql({ column: sql`c.internal_id`, cursor })}
		ORDER BY c.internal_id DESC
		OFFSET ${scanCap - 1}
		LIMIT 1
		${planetScaleTag({ query: "findCustomerWalkBoundary" })}
	`);
	const row = rows[0] as { internal_id: string } | undefined;
	return row?.internal_id ?? null;
};
