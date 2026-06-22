import type { ActiveSandbox } from "./useActiveSandbox";

/** Preserve the selection until the list loads (cold-reload restore); then drop it if
 *  absent, self-heal name/color/icon if present, keeping the same reference when nothing
 *  changed (the consumer effect guards on identity, so a fresh object every render loops). */
export const reconcileActiveSandbox = ({
	activeSandbox,
	sandboxes,
	listLoaded,
}: {
	activeSandbox: ActiveSandbox | null;
	sandboxes: ActiveSandbox[];
	listLoaded: boolean;
}): ActiveSandbox | null => {
	if (!listLoaded || activeSandbox === null) {
		return activeSandbox;
	}
	const loaded = sandboxes.find((sandbox) => sandbox.id === activeSandbox.id);
	if (!loaded) {
		return null;
	}
	const unchanged =
		loaded.name === activeSandbox.name &&
		loaded.color === activeSandbox.color &&
		loaded.icon === activeSandbox.icon;
	if (unchanged) {
		return activeSandbox;
	}
	return {
		id: loaded.id,
		name: loaded.name,
		color: loaded.color,
		icon: loaded.icon,
	};
};
