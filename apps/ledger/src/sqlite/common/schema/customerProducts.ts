import { schemas } from "@autumn/shared";
import { toSqliteTable } from "./toSqliteTable.js";

export const customerProducts = toSqliteTable(schemas.customerProducts);
