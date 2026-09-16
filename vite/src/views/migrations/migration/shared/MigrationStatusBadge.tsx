import type { MigrationStatus } from "@autumn/shared";
import { Badge } from "@autumn/ui";
import {
	CheckCircleIcon,
	ClockIcon,
	type Icon,
	PencilSimpleIcon,
	PlayCircleIcon,
} from "@phosphor-icons/react";
import { cn } from "@/lib/utils";
import { type MigrationStatusBadgeSpec, statusBadge } from "./migrationStatus";

const TONE_STYLES: Record<MigrationStatusBadgeSpec["tone"], string> = {
	draft: "bg-muted text-tertiary-foreground border-transparent",
	waiting: "bg-yellow-500/10 text-yellow-500 border-transparent",
	running: "bg-green-500/10 text-green-500 border-transparent",
	run: "bg-blue-500/10 text-blue-500 border-transparent",
};

const TONE_ICONS: Record<MigrationStatusBadgeSpec["tone"], Icon> = {
	draft: PencilSimpleIcon,
	waiting: ClockIcon,
	running: PlayCircleIcon,
	run: CheckCircleIcon,
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
	const ToneIcon = TONE_ICONS[spec.tone];
	return (
		<Badge
			variant="muted"
			className={cn(
				"gap-1 whitespace-nowrap",
				TONE_STYLES[spec.tone],
				className,
			)}
		>
			<ToneIcon size={12} weight="fill" />
			{spec.label}
		</Badge>
	);
}
