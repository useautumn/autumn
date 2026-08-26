export type DeletePlanScope = "version" | "all";

export const DELETE_THIS_VERSION_WARNING =
	"Are you sure you want to delete this version? This action cannot be undone.";

export const DELETE_PLAN_SCOPE_LABELS: Record<DeletePlanScope, string> = {
	version: "Delete this version",
	all: "All versions",
};

export const allVersionsScopeLabel = ({
	willArchiveAll,
}: {
	willArchiveAll: boolean;
}) => (willArchiveAll ? "Archive all versions" : "All versions");

export const canDeleteThisVersion = ({
	hasPreview,
	previewFailed,
	willArchive,
}: {
	hasPreview: boolean;
	previewFailed: boolean;
	willArchive: boolean;
}) => hasPreview && !previewFailed && !willArchive;

export const hasMultiplePlanVersions = ({
	viewedVersion,
	listedVersion,
	numVersions,
}: {
	viewedVersion: number;
	listedVersion: number | undefined;
	numVersions: number;
}) =>
	numVersions > 1 ||
	viewedVersion > 1 ||
	(listedVersion != null &&
		(listedVersion > 1 || listedVersion !== viewedVersion));

export const canChooseDeleteScope = ({
	thisVersionDeletable,
	hasMultipleVersions,
	willArchiveAll,
}: {
	thisVersionDeletable: boolean;
	hasMultipleVersions: boolean;
	willArchiveAll: boolean;
}) => thisVersionDeletable && (hasMultipleVersions || willArchiveAll);

export const shouldRemoveThisVersion = ({
	thisVersionDeletable,
	scope,
}: {
	thisVersionDeletable: boolean;
	scope: DeletePlanScope;
}) => thisVersionDeletable && scope === "version";
