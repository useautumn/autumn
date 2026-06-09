interface RuleFieldProps {
	readonly label: string;
	readonly children: React.ReactNode;
}

export const RuleField = ({ label, children }: RuleFieldProps) => (
	<div className="flex min-h-6 items-center gap-2">
		<span className="w-36 shrink-0 text-xs text-tertiary-foreground">
			{label}
		</span>
		{children}
	</div>
);
