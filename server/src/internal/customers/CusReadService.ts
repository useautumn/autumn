import { type Customer, customers } from "@autumn/shared";
import { inArray } from "drizzle-orm";
import type { DrizzleCli } from "@/db/initDrizzle.js";

export class CusReadService {
	static async getInInternalIds({
		db,
		internalIds,
	}: {
		db: DrizzleCli;
		internalIds: string[];
	}) {
		const data = await db.query.customers.findMany({
			where: inArray(customers.internal_id, internalIds),
		});

		return data as Customer[];
	}
}
