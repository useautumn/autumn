import type { ByocCacheDeployment } from "@autumn/shared";
import type { AtomRecord } from "@/internal/byoc/atomRecords/types/atomRecord.js";

/** Our shadow Atom's record: what an org's row holds of its deploy, kept in the edge config instead. `atom_id` is null on one set up before shadow Atoms took Atom ids. */
export type ShadowAtomRecord = AtomRecord &
	Pick<ByocCacheDeployment, "created_at" | "stack_name"> & {
		atom_id: string | null;
	};

/** The current shadow Atom, if any, and earlier ones still being removed, oldest first. */
export type ShadowAtomRecords = {
	current: ShadowAtomRecord | null;
	previous: ShadowAtomRecord[];
};
