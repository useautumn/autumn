import { differenceInSeconds } from "date-fns";

const LAST_RELOAD_AT_KEY = "autumn:stale-chunk-reload-at";
const RELOAD_COOLDOWN_SECONDS = 10;

type ReloadStorage = Pick<Storage, "getItem" | "setItem">;

export const claimStaleChunkReload = ({
	storage,
	now,
}: {
	storage: ReloadStorage;
	now: Date;
}) => {
	const lastReloadAt = Number(storage.getItem(LAST_RELOAD_AT_KEY));
	if (differenceInSeconds(now, lastReloadAt) < RELOAD_COOLDOWN_SECONDS) {
		return false;
	}
	storage.setItem(LAST_RELOAD_AT_KEY, String(now.getTime()));
	return true;
};

export const reloadOnStaleChunk = () => {
	if (!claimStaleChunkReload({ storage: sessionStorage, now: new Date() })) {
		return;
	}
	window.location.reload();
};
