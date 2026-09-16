import type { MigrationStatus } from "@autumn/shared";

export type MigrationStatusBadgeSpec = {
	label: string;
	tone: "muted" | "active" | "done";
	live: boolean;
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
				tone: "active",
				live: true,
			};
		case "running":
			return { label: "Running", tone: "active", live: true };
		case "run":
			return { label: "Run", tone: "done", live: false };
		default:
			return { label: "Draft", tone: "muted", live: false };
	}
}
