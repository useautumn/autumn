import type { ByocCacheDeployment } from "@autumn/shared";
import type { AtomRecord } from "@/internal/byoc/atomRecords/types/atomRecord.js";

export type ShadowAtomRecord = AtomRecord &
	Pick<ByocCacheDeployment, "created_at" | "stack_name" | "network"> & {
		atom_id: string | null;
	};

export type ShadowAtomRecords = {
	current: ShadowAtomRecord | null;
	previous: ShadowAtomRecord[];
};
