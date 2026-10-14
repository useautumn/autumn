const RELOADED_BUILD_KEY = "autumn:stale-chunk-reloaded-build";

type ReloadStorage = Pick<Storage, "getItem" | "setItem">;

export const claimStaleChunkReload = ({
	storage,
	buildId,
}: {
	storage: ReloadStorage;
	buildId: string;
}) => {
	try {
		if (storage.getItem(RELOADED_BUILD_KEY) === buildId) return false;
		storage.setItem(RELOADED_BUILD_KEY, buildId);
		return true;
	} catch {
		return false;
	}
};

export const reloadOnStaleChunk = () => {
	if (
		!claimStaleChunkReload({
			storage: sessionStorage,
			buildId: import.meta.url,
		})
	) {
		return;
	}
	window.location.reload();
};
