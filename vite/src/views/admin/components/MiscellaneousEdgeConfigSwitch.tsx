import { Switch } from "@autumn/ui";

export const MiscellaneousEdgeConfigSwitch = ({
	title,
	description,
	ariaLabel,
	checked,
	onCheckedChange,
}: {
	title: string;
	description: string;
	ariaLabel: string;
	checked: boolean;
	onCheckedChange: (checked: boolean) => void;
}) => (
	<div className="rounded-lg border border-border p-3 flex items-center justify-between gap-6">
		<div className="flex min-w-0 flex-col gap-1">
			<div className="text-sm font-medium text-foreground">{title}</div>
			<div className="text-pretty text-xs text-tertiary-foreground">
				{description}
			</div>
		</div>
		<Switch
			aria-label={ariaLabel}
			checked={checked}
			onCheckedChange={onCheckedChange}
		/>
	</div>
);
