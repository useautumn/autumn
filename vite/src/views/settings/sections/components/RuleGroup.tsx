interface RuleGroupProps {
	readonly title: string;
	readonly description: string;
	readonly children: React.ReactNode;
}

export const RuleGroup = ({ title, description, children }: RuleGroupProps) => (
	<div className="flex flex-col gap-2.5 px-4 py-3.5">
		<div className="flex flex-col gap-0.5">
			<span className="text-sm font-medium text-foreground">{title}</span>
			<span className="text-xs text-tertiary-foreground">{description}</span>
		</div>
		<div className="flex flex-col gap-2.5">{children}</div>
	</div>
);
