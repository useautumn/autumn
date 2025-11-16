import { Table } from "@/components/ui/table";

export function TableContent({ children }: { children: React.ReactNode }) {
	return (
		<div className="overflow-hidden rounded-lg border border-border-table bg-background shadow-sm">
			<Table className="table-fixed p-0">{children}</Table>
		</div>
	);
}
