import type { MigrationStatus } from "@autumn/shared";
import type { StatusGlyph, StatusTone } from "@autumn/ui";

export const STATUS_INDICATORS: Record<
	MigrationStatus,
	{ tone: StatusTone; glyph: StatusGlyph }
> = {
	draft: { tone: "neutral", glyph: "pencil" },
	waiting: { tone: "yellow", glyph: "clock" },
	running: { tone: "green", glyph: "play" },
	run: { tone: "blue", glyph: "check" },
	no_changes: { tone: "neutral", glyph: "minus" },
	failed: { tone: "orange", glyph: "alert" },
	canceled: { tone: "neutral", glyph: "ban" },
};

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
		failed: "Incomplete",
		canceled: "Canceled",
	}[status];
}
