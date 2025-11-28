import type { Event } from "@autumn/shared";
import type { Row } from "@tanstack/react-table";
import { format } from "date-fns";

export const CustomerUsageAnalyticsColumns = [
	{
		header: "Feature",
		accessorKey: "event_name",
		cell: ({ row }: { row: Row<Event> }) => {
			return (
				<div className="text-tiny font-mono truncate text-t2!">
					{row.original.event_name}
				</div>
			);
		},
	},
	{
		header: "Value",
		accessorKey: "value",
		cell: ({ row }: { row: Row<Event> }) => {
			const event = row.original;
			return (
				<div className="text-t3 text-tiny truncate">
					{event.value || event.properties?.value || 1}
				</div>
			);
		},
	},
	// {
	// 	header: "Status",
	// 	accessorKey: "status",
	// 	size: 60,
	// 	cell: () => {
	// 		return (
	// 			<div className="font-mono text-tiny">
	// 				<span className="text-t3">POST </span>
	// 				<span className="text-lime-600 dark:text-lime-400">200</span>
	// 			</div>
	// 		);
	// 	},
	// },
	{
		header: "Timestamp",
		accessorKey: "timestamp",
		cell: ({ row }: { row: Row<Event> }) => {
			// type is Date but actually comes as a string
			const dateObj = new Date(row.original.timestamp as unknown as string);
			const dateAsNumber = dateObj.getTime();

			return (
				<div className="text-tiny text-t3 font-mono min-w-fit">
					{/* {formatUnixToDateTimeWithMs(dateAsNumber)} */}
					{format(new Date(dateAsNumber), "d MMM HH:mm:ss")}
				</div>
			);
		},
	},
];
