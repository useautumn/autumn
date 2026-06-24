import type { ColumnDef } from "@tanstack/react-table";
import {
	formatFullTimestamp,
	parseUTCTimestamp,
} from "../utils/parseTimestamp";
import type { IRow } from "./analytics-types";

function formatTimestamp(value: string): string {
	const date = parseUTCTimestamp(value);
	if (!Number.isFinite(date.getTime())) return value;
	return formatFullTimestamp(date);
}

function formatProperties(value: unknown): string {
	if (!value) return "";
	if (typeof value === "string") {
		try {
			return JSON.stringify(JSON.parse(value));
		} catch {
			return value;
		}
	}
	return JSON.stringify(value);
}

export function createEventsColumns(): ColumnDef<IRow, unknown>[] {
	return [
		{
			id: "timestamp",
			accessorKey: "timestamp",
			header: "Timestamp",
			cell: ({ getValue }) => formatTimestamp(getValue() as string),
			size: 200,
		},
		{
			id: "event_name",
			accessorKey: "event_name",
			header: "Event Name",
			size: 150,
		},
		{
			id: "value",
			accessorKey: "value",
			header: "Value",
			size: 80,
		},
		{
			id: "properties",
			accessorKey: "properties",
			header: "Properties",
			cell: ({ getValue }) => (
				<span className="truncate text-tertiary-foreground">
					{formatProperties(getValue())}
				</span>
			),
			size: 250,
		},
	];
}
