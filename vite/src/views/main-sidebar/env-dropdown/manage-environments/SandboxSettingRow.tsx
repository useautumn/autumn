import type { ReactNode } from "react";

export const SandboxSettingRow = ({
	title,
	description,
	action,
}: {
	title: string;
	description: string;
	action: ReactNode;
}) => (
	<div className="flex items-center justify-between gap-4">
		<div className="flex min-w-0 flex-col gap-0.5">
			<span className="text-sm font-medium text-foreground">{title}</span>
			<span className="text-xs text-tertiary-foreground">{description}</span>
		</div>
		<div className="shrink-0">{action}</div>
	</div>
);
