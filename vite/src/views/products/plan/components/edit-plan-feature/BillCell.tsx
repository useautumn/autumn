export function BillCell({ label, value }: { label: string; value: string }) {
	return (
		<div className="flex flex-col">
			<span className="whitespace-nowrap text-tertiary-foreground text-xs">
				{label}
			</span>
			<span className="whitespace-nowrap">{value}</span>
		</div>
	);
}
