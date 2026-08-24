import { schemas } from "@autumn/shared";
import { toSqliteTable } from "./toSqliteTable.js";

export const products = toSqliteTable(schemas.products);
