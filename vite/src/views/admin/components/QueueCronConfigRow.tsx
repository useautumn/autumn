import { Button } from "@autumn/ui";
import type { ReactNode } from "react";

export const QueueCronConfigRow = ({
	icon,
	label,
	title,
	description,
	onEdit,
}: {
	icon: ReactNode;
	label: string;
	title: string;
	description: string;
	onEdit: () => void;
}) => (
	<div className="flex items-center gap-4 px-4 py-3.5">
		<div className="flex size-9 shrink-0 items-center justify-center rounded-lg border border-border bg-muted/30 text-muted-foreground">
			{icon}
		</div>
		<div className="min-w-0 flex-1">
			<div className="text-xs text-tertiary-foreground">{label}</div>
			<div className="mt-0.5 text-sm font-medium text-foreground">{title}</div>
			<div className="mt-0.5 text-pretty text-xs text-tertiary-foreground">
				{description}
			</div>
		</div>
		<Button variant="secondary" size="sm" onClick={onEdit}>
			Edit
		</Button>
	</div>
);
