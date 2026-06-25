import type { Row } from "@tanstack/react-table";
import { CopyTextButton } from "@autumn/ui";
import { dateSkeleton } from "@/components/general/table";
import { formatUnixToDateTime } from "@/utils/formatUtils/formatDateUtils";

export function createDateTimeColumn<T>({
	header,
	accessorKey,
	className = "text-xs text-tertiary-foreground",
	withYear = false,
}: {
	header: string;
	accessorKey: keyof T & string;
	className?: string;
	withYear?: boolean;
}) {
	return {
		header,
		accessorKey,
		meta: { skeleton: dateSkeleton },
		cell: ({ row }: { row: Row<T> }) => {
			const timestamp = row.original[accessorKey] as number;
			const { date, time } = formatUnixToDateTime(timestamp, { withYear });
			return (
				<div className={className}>
					{date} {time}
				</div>
			);
		},
	};
}
