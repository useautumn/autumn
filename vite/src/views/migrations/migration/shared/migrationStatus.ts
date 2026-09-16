import type { MigrationStatus } from "@autumn/shared";

export type MigrationStatusBadgeSpec = {
	label: string;
	tone: "draft" | "waiting" | "running" | "run";
};

export function runButtonLabel(status: MigrationStatus): string {
	return status === "run" ? "Run again" : "Run All";
}

export function isRunDisabled(status: MigrationStatus): boolean {
	return status === "running" || status === "waiting";
}

export function waitingExplanation(blockedBy: string | null): string {
	const blocker = blockedBy ? `"${blockedBy}"` : "the current run";
	return `Only one migration runs at a time per organization. This one starts once ${blocker} finishes.`;
}

export function statusBadge({
	status,
	blockedBy,
}: {
	status: MigrationStatus;
	blockedBy: string | null;
}): MigrationStatusBadgeSpec {
	switch (status) {
		case "waiting":
			return {
				label: blockedBy ? `Waiting on ${blockedBy}` : "Waiting",
				tone: "waiting",
			};
		case "running":
			return { label: "Running", tone: "running" };
		case "run":
			return { label: "Run", tone: "run" };
		default:
			return { label: "Draft", tone: "draft" };
	}
}
