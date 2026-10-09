import type { ByocCacheDeployment } from "@autumn/shared";
import type { AtomRecord } from "@/internal/byoc/atomRecords/types/atomRecord.js";

/** Our shadow Atom's record: what an org's row holds of its deploy, kept in the edge config instead. */
export type ShadowAtomRecord = AtomRecord &
	Pick<ByocCacheDeployment, "created_at">;
