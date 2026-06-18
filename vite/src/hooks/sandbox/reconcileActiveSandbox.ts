import type { ActiveSandbox } from "./useActiveSandbox";

/** The active sandbox after reconciling against the loaded list. Returns the
 *  current value unchanged until `listLoaded`, so a cold-reload restore is never
 *  dropped before the list arrives; drops it only once a loaded list omits it. */
export const reconcileActiveSandbox = ({
	activeSandbox,
	sandboxes,
	listLoaded,
}: {
	activeSandbox: ActiveSandbox | null;
	sandboxes: { id: string }[];
	listLoaded: boolean;
}): ActiveSandbox | null => {
	if (!listLoaded || activeSandbox === null) {
		return activeSandbox;
	}
	return sandboxes.some((sandbox) => sandbox.id === activeSandbox.id)
		? activeSandbox
		: null;
};
