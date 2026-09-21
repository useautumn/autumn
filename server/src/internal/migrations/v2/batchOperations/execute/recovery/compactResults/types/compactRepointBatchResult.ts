import type { z } from "zod/v4";
import type { RepointBatchResultSchema } from "../../../types/repointBatchResult.js";

type RepointedRow = z.infer<typeof RepointBatchResultSchema>["rows"][number];
type RowFields = "internalCustomerId" | "customerProductId";
type Defaults = Omit<RepointedRow, RowFields>;
type CompactRow = Pick<RepointedRow, RowFields> & Partial<Defaults>;

export type CompactRepointBatchResult = { format: "compact-repoint-v1" } & (
	| { defaults: null; rows: [] }
	| { defaults: Defaults; rows: CompactRow[] }
);
