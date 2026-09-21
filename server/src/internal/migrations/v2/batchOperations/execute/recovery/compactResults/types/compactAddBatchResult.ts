import type { z } from "zod/v4";
import type { AddBatchResultSchema } from "../../../../actions/addCustomerEntitlementsForPage/types/addBatchResult.js";

type AddBatchResult = z.infer<typeof AddBatchResultSchema>;
type InsertedItem = AddBatchResult["insertedItems"][number];

// Optional remaining stays on each row so absence, null and zero stay distinct.
type RowFields = "internalCustomerId" | "customerProductId" | "remaining";
type Defaults = Omit<InsertedItem, RowFields>;
type CompactRow = Pick<InsertedItem, RowFields> & Partial<Defaults>;

export type CompactAddBatchResult = {
	format: "compact-add-v1";
	candidates: AddBatchResult["candidates"];
	excludedInternalCustomerIds: AddBatchResult["excludedInternalCustomerIds"];
} & ({ defaults: null; rows: [] } | { defaults: Defaults; rows: CompactRow[] });
