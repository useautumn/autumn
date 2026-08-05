import { Switch } from "@autumn/ui";

export const MiscellaneousEdgeConfigSwitch = ({
	title,
	hint,
	ariaLabel,
	checked,
	onCheckedChange,
}: {
	title: string;
	hint?: string;
	ariaLabel: string;
	checked: boolean;
	onCheckedChange: (checked: boolean) => void;
}) => (
	<div className="flex items-center justify-between gap-6 px-3 py-2.5">
		<div className="flex min-w-0 flex-col">
			<div className="text-sm text-foreground">{title}</div>
			{hint && <div className="text-xs text-tertiary-foreground">{hint}</div>}
		</div>
		<Switch
			aria-label={ariaLabel}
			checked={checked}
			onCheckedChange={onCheckedChange}
		/>
	</div>
);
