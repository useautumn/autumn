import { type ActionInsert, actions } from "@autumn/shared";
import type { DrizzleCli } from "@/db/initDrizzle.js";

export class ActionService {
	static async insert(db: DrizzleCli, data: ActionInsert | ActionInsert[]) {
		const dataArray = Array.isArray(data) ? data : [data];

		await db.insert(actions).values(dataArray);
	}
}
