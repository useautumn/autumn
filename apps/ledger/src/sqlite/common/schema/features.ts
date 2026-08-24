import { schemas } from "@autumn/shared";
import { toSqliteTable } from "./toSqliteTable.js";

export const features = toSqliteTable(schemas.features);
