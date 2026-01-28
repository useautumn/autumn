import type { Row } from "@tanstack/react-table";
import CopyButton from "@/components/general/CopyButton";
import { formatUnixToDateTime } from "@/utils/formatUtils/formatDateUtils";

/**
 * Creates a reusable date/time column for tables.
 */
export function createDateTimeColumn<T>({
	header,
	accessorKey,
	className = "text-xs text-t3",
}: {
	header: string;
	accessorKey: keyof T & string;
	className?: string;
}) {
	return {
		header,
		accessorKey,
		cell: ({ row }: { row: Row<T> }) => {
			const timestamp = row.original[accessorKey] as number;
			const { date, time } = formatUnixToDateTime(timestamp);
			return (
				<div className={className}>
					{date} {time}
				</div>
			);
		},
	};
}

/**
 * Creates a reusable ID column with copy button.
 */
function createIdCopyColumn<T>({
	header = "ID",
	accessorKey,
	displayKey,
}: {
	header?: string;
	accessorKey: keyof T & string;
	displayKey?: keyof T & string;
}) {
	return {
		header,
		accessorKey,
		cell: ({ row }: { row: Row<T> }) => {
			const id = row.original[accessorKey] as string;
			const displayValue = displayKey
				? (row.original[displayKey] as string)
				: id;

			return (
				<div className="font-mono">
					{id ? (
						<CopyButton
							text={id}
							className="bg-transparent text-t3 border-none px-1 shadow-none max-w-full font-sans"
						>
							<span className="truncate">{displayValue}</span>
						</CopyButton>
					) : (
						<span className="px-1 text-t3">NULL</span>
					)}
				</div>
			);
		},
	};
}
