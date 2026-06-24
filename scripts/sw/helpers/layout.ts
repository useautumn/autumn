import { paneRename, paneRun, paneSplit } from "./herdr.ts";

/**
 * Lay out the convenience panes around the current (server) pane: rename it,
 * split off a claude pane. For remote worktrees the split pane is spawned by the
 * sw wrapper shell, which has already ssh'd into the box (the marker is written
 * before this runs), so `claude` executes on the devbox. For local it runs here.
 */
export function layoutPanes(selfPaneId: string): void {
	paneRename(selfPaneId, "server");
	const claudePane = paneSplit(selfPaneId, { direction: "right", ratio: 0.4 });
	if (claudePane) {
		paneRename(claudePane, "claude");
		paneRun(claudePane, "claude");
	}
}
