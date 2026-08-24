import { products } from "@autumn/shared";
import { isNull } from "drizzle-orm";

/** Catalog reads hide tombstones. Occupancy / history paths omit this. */
export const liveProductWhere = isNull(products.deleted_at);
