export const ApprovalRulesEmpty = ({
	title,
	description,
}: {
	title: string;
	description?: string;
}) => (
	<div className="flex flex-col items-center gap-1 rounded-lg border border-dashed bg-interactive-secondary px-3 py-8 text-center">
		<span className="font-medium text-foreground text-sm">{title}</span>
		{description && (
			<span className="text-tertiary-foreground text-xs">{description}</span>
		)}
	</div>
);
