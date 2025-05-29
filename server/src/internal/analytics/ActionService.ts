import { DrizzleCli } from "@/db/initDrizzle.js";
import { Action, ActionInsert, actions } from "@autumn/shared";

export class ActionService {
  static async insert(db: DrizzleCli, data: ActionInsert | ActionInsert[]) {
    const dataArray = Array.isArray(data) ? data : [data];

    await db.insert(actions).values(dataArray);
  }
}
