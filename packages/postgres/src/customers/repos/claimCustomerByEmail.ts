import { type SQL, sql } from "drizzle-orm";
import { z } from "zod/v4";
import { parseRows } from "../../common/parseRows.js";
import type { PostgresContext } from "../../types/postgresClient.js";

const claimedRowSchema = z.object({ internal_id: z.string() }).strict();

export const claimCustomerByEmailSql = ({
	ctx,
	customerId,
	email,
}: {
	ctx: Pick<PostgresContext, "orgId" | "env">;
	customerId: string;
	email: string;
}): SQL => sql`
	UPDATE customers
	SET id = ${customerId}
	WHERE org_id = ${ctx.orgId}
		AND env = ${ctx.env}
		AND id IS NULL
		AND email IS NOT NULL
		AND email != ''
		AND lower(email) = lower(${email})
	RETURNING internal_id
`;

export const claimCustomerByEmail = async ({
	ctx,
	customerId,
	email,
}: {
	ctx: PostgresContext;
	customerId: string;
	email: string;
}): Promise<string | null> => {
	const result = await ctx.db.execute(
		claimCustomerByEmailSql({ ctx, customerId, email }),
	);
	const [claimed] = parseRows({
		table: "customers",
		schema: claimedRowSchema,
		rows: result.rows,
	});
	return claimed?.internal_id ?? null;
};
