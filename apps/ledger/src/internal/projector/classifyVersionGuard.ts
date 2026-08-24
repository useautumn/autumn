export type VersionGuardVerdict = "duplicate" | "gap";

const NO_VERSION_APPLIED = 0;

/** Why a guarded advance moved no row. At or behind the cursor the entry has
 *  already been applied; past it, an entry was lost and the projection is
 *  no longer a fold of the log. */
export const classifyVersionGuard = ({
	entryVersion,
	storedVersion,
}: {
	entryVersion: number;
	storedVersion: number | undefined;
}): VersionGuardVerdict =>
	entryVersion <= (storedVersion ?? NO_VERSION_APPLIED) ? "duplicate" : "gap";
