import type { MigrationStatus } from "@autumn/shared";

export function runButtonLabel(status: MigrationStatus): string {
	return status === "run" || status === "no_changes" ? "Run again" : "Run All";
}

export function isRunDisabled(status: MigrationStatus): boolean {
	return status === "running" || status === "waiting";
}

export function waitingExplanation(blockedBy: string | null): string {
	const blocker = blockedBy ? `"${blockedBy}"` : "the current run";
	return `Only one migration runs at a time per organization. This one starts once ${blocker} finishes.`;
}

export function statusLabel({
	status,
	blockedBy,
}: {
	status: MigrationStatus;
	blockedBy: string | null;
}): string {
	if (status === "waiting")
		return blockedBy ? `Waiting on ${blockedBy}` : "Waiting";
	return {
		draft: "Draft",
		running: "Running",
		run: "Run",
		no_changes: "No changes",
		failed: "Failed",
		canceled: "Canceled",
	}[status];
}
