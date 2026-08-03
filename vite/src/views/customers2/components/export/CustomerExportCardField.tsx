export function CustomerExportCardField({
	label,
	children,
}: {
	label: string;
	children: React.ReactNode;
}) {
	return (
		<div className="flex flex-col gap-1.5">
			<span className="block font-medium text-tertiary-foreground text-xs">
				{label}
			</span>
			{children}
		</div>
	);
}
