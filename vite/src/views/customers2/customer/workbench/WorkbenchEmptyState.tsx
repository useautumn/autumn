export const WorkbenchEmptyState = ({
	title,
	children,
}: {
	title: string;
	children: React.ReactNode;
}) => (
	<div className="p-6 text-xs text-t3">
		<p className="font-medium text-t2 mb-1">{title}</p>
		<p>{children}</p>
	</div>
);
