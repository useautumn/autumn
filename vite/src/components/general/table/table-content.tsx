import { Table } from "@/components/ui/table";

export function TableContent({ children }: { children: React.ReactNode }) {
  return (
    <div className="overflow-hidden rounded-2xl border border-border-table bg-background shadow-[0_4px_4px_0_#00000005]">
      <Table className="table-fixed p-0">{children}</Table>
    </div>
  );
}
