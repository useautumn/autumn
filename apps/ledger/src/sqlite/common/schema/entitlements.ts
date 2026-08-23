import { schemas } from "@autumn/shared";
import { toSqliteTable } from "./toSqliteTable.js";

export const entitlements = toSqliteTable(schemas.entitlements);
