interface CompactValueChangeProps {
	oldValue: string | number | null;
	newValue: string | number | null;
}

export function CompactValueChange({
	oldValue,
	newValue,
}: CompactValueChangeProps) {
	return (
		<span className="text-xs flex items-center gap-1">
			<span className="text-red-500">{oldValue}</span>
			<span className="text-t3">→</span>
			<span className="text-green-500">{newValue}</span>
		</span>
	);
}
