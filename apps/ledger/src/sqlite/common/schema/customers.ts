import { schemas } from "@autumn/shared";
import { toSqliteTable } from "./toSqliteTable.js";

export const customers = toSqliteTable(schemas.customers);
