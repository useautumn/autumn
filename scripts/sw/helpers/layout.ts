import { paneRename, paneRun, paneSplit, paneSwap } from "./herdr.ts";

/**
 * Lay out the convenience panes around the current (server) pane. herdr can only
 * split right/down, so we split right then swap, leaving claude on the LEFT and
 * the server pane on the RIGHT (the caller hands that pane to the dev server).
 * `claudeCmd` is `claude` locally, or `ssh … claude` for a remote box.
 */
export function layoutPanes(selfPaneId: string, claudeCmd: string): void {
	paneRename(selfPaneId, "server");
	const claudePane = paneSplit(selfPaneId, { direction: "right", ratio: 0.5 });
	if (claudePane) {
		paneRename(claudePane, "claude");
		paneRun(claudePane, claudeCmd);
		paneSwap(selfPaneId, claudePane);
	}
}
