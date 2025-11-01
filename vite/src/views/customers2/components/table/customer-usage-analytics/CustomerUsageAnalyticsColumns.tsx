import type { Event } from "@autumn/shared";
import type { Row } from "@tanstack/react-table";
import { formatUnixToDateTime } from "@/utils/formatUtils/formatDateUtils";

export const CustomerUsageAnalyticsColumns = [
	{
		header: "Event Name",
		accessorKey: "event_name",
		cell: ({ row }: { row: Row<Event> }) => {
			return <div>{row.original.event_name}</div>;
		},
	},
	{
		header: "Value",
		accessorKey: "value",
		cell: ({ row }: { row: Row<Event> }) => {
			const event = row.original;
			return <div>{event.value || event.properties?.value || 1}</div>;
		},
	},
	{
		header: "Status",
		accessorKey: "status",
		cell: () => {
			return (
				<div className="font-mono">
					<span className="text-t3">POST </span>
					<span className="text-lime-600">200</span>
				</div>
			);
		},
	},
	{
		header: "Timestamp",
		accessorKey: "timestamp",
		cell: ({ row }: { row: Row<Event> }) => {
			// type is Date but actually comes as a string
			const dateObj = new Date(row.original.timestamp as unknown as string);
			const dateAsNumber = dateObj.getTime();

			const { date, time } = formatUnixToDateTime(dateAsNumber);
			return (
				<div className="text-xs text-t3">
					{date} {time}
				</div>
			);
		},
	},
];
