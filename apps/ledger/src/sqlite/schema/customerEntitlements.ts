import { schemas } from "@autumn/shared";
import { toSqliteTable } from "./toSqliteTable.js";

export const customerEntitlements = toSqliteTable(schemas.customerEntitlements);
