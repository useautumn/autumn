export const WorkbenchEmptyState = ({
	title,
	children,
}: {
	title: string;
	children: React.ReactNode;
}) => (
	<div className="p-6 text-xs text-tertiary-foreground">
		<p className="font-medium text-muted-foreground mb-1">{title}</p>
		<p>{children}</p>
	</div>
);
