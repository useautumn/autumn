import { Table } from "@/components/ui/table";

export function TableContent({ children }: { children: React.ReactNode }) {
	return (
		<div className="overflow-hidden rounded-2xl border bg-background">
			<Table className="table-fixed p-0">{children}</Table>
		</div>
	);
}
