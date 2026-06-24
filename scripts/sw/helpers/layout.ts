import { paneRename, paneRun, paneSplit } from "./herdr.ts";

/**
 * Lay out the convenience panes around the current (server) pane: rename it, then
 * split off a claude pane running `claudeCmd` (locally `claude`, or `ssh … claude`
 * for a remote box). The current pane is handed to the dev server by the caller.
 */
export function layoutPanes(selfPaneId: string, claudeCmd: string): void {
	paneRename(selfPaneId, "server");
	const claudePane = paneSplit(selfPaneId, { direction: "right", ratio: 0.4 });
	if (claudePane) {
		paneRename(claudePane, "claude");
		paneRun(claudePane, claudeCmd);
	}
}
