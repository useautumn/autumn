import type { MigrationStatus } from "@autumn/shared";
import { Badge } from "@autumn/ui";
import { cn } from "@/lib/utils";
import { ActiveRunDot } from "../runs/RunStatusBadge";
import { type MigrationStatusBadgeSpec, statusBadge } from "./migrationStatus";

const TONE_STYLES: Record<MigrationStatusBadgeSpec["tone"], string> = {
	muted: "bg-muted text-muted-foreground border-transparent",
	active: "bg-green-500/10 text-green-500 border-transparent",
	done: "bg-blue-500/10 text-blue-500 border-transparent",
};

export function MigrationStatusBadge({
	status,
	blockedBy,
	className,
}: {
	status: MigrationStatus;
	blockedBy: string | null;
	className?: string;
}) {
	const spec = statusBadge({ status, blockedBy });
	return (
		<Badge
			variant="muted"
			className={cn(
				"gap-1.5 whitespace-nowrap",
				TONE_STYLES[spec.tone],
				className,
			)}
		>
			{spec.live && <ActiveRunDot className="h-2 w-2" />}
			{spec.label}
		</Badge>
	);
}
