import { ACTIVE_STATUSES } from "@autumn/shared";
import { sql } from "drizzle-orm";

export const sqlList = ({ values }: { values: string[] }) =>
	sql.join(
		values.map((value) => sql`${value}`),
		sql`, `,
	);

export const activeStatusesSql = sqlList({ values: [...ACTIVE_STATUSES] });
