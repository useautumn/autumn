import { StepBadge } from "@autumn/ui";

export const AtomSetupStep = ({
	number,
	title,
	description,
	children,
}: {
	number: number;
	title: string;
	description: string;
	children?: React.ReactNode;
}) => (
	<li className="flex items-start gap-3">
		<div className="shrink-0">
			<StepBadge>{number}</StepBadge>
		</div>
		<div className="flex min-w-0 flex-1 flex-col gap-1">
			<span className="text-sm font-medium text-foreground">{title}</span>
			<p className="text-sm text-tertiary-foreground">{description}</p>
			{children && <div className="pt-2">{children}</div>}
		</div>
	</li>
);
