export const WhenHeader = ({
	label,
	count,
}: {
	label: string;
	count: number;
}) => (
	<div className="flex items-baseline gap-2 text-sm">
		<span className="font-medium text-foreground">{label}</span>
		<span className="text-subtle text-xs">
			{count === 1 ? "1 condition" : `${count} conditions`}
		</span>
	</div>
);
