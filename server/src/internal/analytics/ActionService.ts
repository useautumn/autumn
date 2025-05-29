import { DrizzleCli } from "@/db/initDrizzle.js";
import { Action, actions } from "@autumn/shared";

export class ActionService {
  static async create(db: DrizzleCli, data: Action | Action[]) {
    const dataArray = Array.isArray(data) ? data : [data];

    await db.insert(actions).values(dataArray);
  }
}
