export function TableToolbar({ children }: { children: React.ReactNode }) {
	return (
		<div className="flex flex-wrap items-center gap-2 min-h-10 pb-4">
			{children}
		</div>
	);
}
