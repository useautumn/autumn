import type { Event } from "@autumn/shared";
import type { ColumnDef, Row } from "@tanstack/react-table";
import { format } from "date-fns";

export const BASE_COLUMN_IDS = ["event_name", "value", "timestamp"];

export const CustomerUsageAnalyticsColumns: ColumnDef<Event>[] = [
	{
		id: "event_name",
		header: "Feature",
		accessorKey: "event_name",
		minSize: 80,
		cell: ({ row }: { row: Row<Event> }) => {
			return (
				<div className="text-tiny font-mono truncate text-t2!">
					{row.original.event_name}
				</div>
			);
		},
	},
	{
		id: "value",
		header: "Value",
		accessorKey: "value",
		minSize: 50,
		cell: ({ row }: { row: Row<Event> }) => {
			const event = row.original;
			return (
				<div className="text-t3 text-tiny truncate">
					{event.value || event.properties?.value || 1}
				</div>
			);
		},
	},
	{
		id: "timestamp",
		header: "Timestamp",
		accessorKey: "timestamp",
		minSize: 100,
		cell: ({ row }: { row: Row<Event> }) => {
			// Timestamp comes as a string from the backend in UTC (e.g., "2025-02-09 14:25:47")
			// Append 'Z' to ensure it's parsed as UTC, then format displays in user's local timezone
			let timestampStr = String(row.original.timestamp);
			if (!timestampStr.endsWith("Z") && !timestampStr.includes("+")) {
				timestampStr = timestampStr.replace(" ", "T") + "Z";
			}
			const dateObj = new Date(timestampStr);

			return (
				<div className="text-tiny text-t3 font-mono truncate">
					{format(dateObj, "d MMM HH:mm:ss")}
				</div>
			);
		},
	},
];

/** Generates dynamic columns from event properties */
export function generatePropertyColumns({
	events,
}: {
	events: Event[];
}): ColumnDef<Event>[] {
	const propertyKeys = new Set<string>();

	for (const event of events) {
		if (event.properties) {
			for (const key of Object.keys(event.properties)) {
				// Skip 'value' as it's already a base column
				if (key !== "value") {
					propertyKeys.add(key);
				}
			}
		}
	}

	return Array.from(propertyKeys).map((key) => ({
		id: `prop_${key}`,
		header: key,
		minSize: 70,
		accessorFn: (row: Event) => {
			const value = row.properties?.[key];
			if (value === undefined || value === null) return "";
			if (typeof value === "object") return JSON.stringify(value);
			return String(value);
		},
		cell: ({ getValue }: { getValue: () => string }) => {
			const value = getValue();
			return (
				<div className="text-t3 text-tiny truncate font-mono">{value}</div>
			);
		},
	}));
}
