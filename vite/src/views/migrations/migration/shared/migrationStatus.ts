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
