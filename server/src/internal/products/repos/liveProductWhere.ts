import { products } from "@autumn/shared";
import { isNull } from "drizzle-orm";

export const liveProductWhere = isNull(products.deleted_at);
