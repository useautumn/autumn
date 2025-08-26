import { DrizzleCli } from "@/db/initDrizzle.js";
import { AppEnv, Organization } from "@autumn/shared";
import { ExtendedRequest } from "@/utils/models/Request.js";
import { sql } from "drizzle-orm";

export class CusBatchService {
	static async getPage({
		db,
		org,
		env,
		page,
		pageSize,
	}: {
		db: DrizzleCli;
		org: Organization;
		env: AppEnv;
		page: number;
		pageSize: 10 | 50 | 100 | 500;
	}) {
        if(!page) page = 1;
        if(!pageSize) pageSize = 10;
		const offset = (page - 1) * pageSize;

		const query = sql`
            WITH paged_customers AS (
                SELECT *
                FROM customers
                WHERE org_id = ${org.id} AND env = ${env}
                ORDER BY id
                LIMIT ${pageSize} OFFSET ${offset}
            )
            SELECT 
                pc.*,
                COALESCE(
                    json_agg(ce.*) FILTER (WHERE ce.id IS NOT NULL),
                    '[]'
                ) AS balances
            FROM paged_customers pc
            LEFT JOIN customer_entitlements ce
                ON ce.internal_customer_id = pc.internal_id
            GROUP BY 
                pc.id, pc.internal_id, pc.org_id, pc.env, pc.fingerprint, pc.created_at, pc.name, pc.email, pc.metadata, pc.processor
            ORDER BY pc.id
        `;

        const res = await db.execute(query)

		return res;
	}
}
