import type { AgChartOptions, FormatterParams } from "ag-charts-community";
import { AgCharts } from "ag-charts-react";
import {
  AllCommunityModule,
  type ColDef,
  ModuleRegistry,
  type PaginationChangedEvent,
  type RowDataUpdatedEvent,
  ValidationModule,
  type ValueFormatterParams,
} from "ag-grid-community";

// Register all Community features

import { AgGridReact } from "ag-grid-react";
import { useEffect, useState } from "react";
import { useAnalyticsContext } from "./AnalyticsContext";
import {
  autumnTheme,
  type IRow,
  paginationOptions,
  type Row,
} from "./components/AGGrid";
import { RowClickDialog } from "./components/RowClickDialog";

const userTimeZone = Intl.DateTimeFormat().resolvedOptions().timeZone;

// Helper function to parse UTC timestamps from the backend
const parseUTCTimestamp = (timestamp: string): Date => {
	// If the timestamp doesn't end with 'Z' or have timezone info, assume it's UTC
	if (!timestamp.includes('Z') && !timestamp.includes('+') && !timestamp.includes('-', 10)) {
		// Add 'Z' to indicate UTC if it's missing
		return new Date(timestamp + (timestamp.includes('T') ? 'Z' : ' UTC'));
	}
	return new Date(timestamp);
};

const dateFormatter = new Intl.DateTimeFormat(navigator.language || "en-US", {
	month: "short",
	day: "numeric",
	timeZone: userTimeZone,
});

const hourFormatter = new Intl.DateTimeFormat(navigator.language || "en-US", {
	hour: "numeric",
	minute: "numeric",
	timeZone: userTimeZone,
});

const timestampFormatter = new Intl.DateTimeFormat(
	navigator.language || "en-US",
	{
		month: "long",
		day: "numeric",
		hour: "numeric",
		minute: "numeric",
		second: "numeric",
		timeZone: userTimeZone,
	},
);

export function EventsBarChart({
	data,
	chartConfig,
}: {
	data: {
		meta: any[];
		rows: number;
		data: Row[];
	};
	chartConfig: any;
}) {
	const { selectedInterval } = useAnalyticsContext();
	const [options, setOptions] = useState<AgChartOptions>({
		data: data.data,
		series: chartConfig,
		theme: {
			params: {
				fontFamily: {
					googleFont: "Inter",
				},
			},
			palette: {
				fills: [
					"#9c5aff",
					"#a97eff",
					"#8268ff",
					"#7571ff",
					"#687aff",
					"#5b83ff",
					"#4e8cff",
					"#4195ff",
					"#349eff",
					"#27a7ff",
				],
			},
		},
		background: {
			fill: "#fafaf9",
		},
		axes: [
			{
				type: "category",
				position: "bottom",
				label: {
					color: "#52525b",
				},
				line: {
					enabled: false,
				},
			},
			{
				type: "number",
				position: "left",
				label: {
					color: "#52525b",
				},
			},
		],
		formatter: {
			x: (params: FormatterParams<any, unknown>) => {
				if (params.type !== "category") return;
				return selectedInterval === "24h"
					? hourFormatter.format(parseUTCTimestamp(params.value as string))
					: dateFormatter.format(parseUTCTimestamp(params.value as string));
			},
		},
		legend: {
			enabled: true,
		},
	});

	useEffect(() => {
		setOptions((prevOptions) => ({
			...prevOptions,
			data: data.data,
			series: chartConfig,
		}));
	}, [chartConfig, data]);

	return <AgCharts options={options} className="h-full w-full" />;
}

export function EventsAGGrid({ data }: { data: any }) {
	const [rowData, setRowData] = useState<IRow[]>([]);
	const [isOpen, setIsOpen] = useState(false);
	const [event, setEvent] = useState<IRow | null>(null);
	const [colDefs] = useState<ColDef<IRow>[]>([
		{
			field: "timestamp",
			flex: 1,
			valueFormatter: (params: ValueFormatterParams<any, unknown>) => {
				return timestampFormatter.format(parseUTCTimestamp(params.value as string));
			},
			cellStyle: {
				paddingLeft: "2.5rem",
				fontWeight: "normal",
			},
			headerStyle: {
				paddingLeft: "2.5rem",
			},
		},
		{ field: "event_name", flex: 1, cellStyle: { fontWeight: "normal" } },
		{ field: "value", flex: 0, cellStyle: { fontWeight: "normal" } },
		{ field: "properties", flex: 1, cellStyle: { fontWeight: "normal" } },
	]);

	ModuleRegistry.registerModules([AllCommunityModule, ValidationModule]);

	const { gridRef, pageSize, setTotalRows, setTotalPages, setCurrentPage } =
		useAnalyticsContext();

	useEffect(() => {
		setRowData(data.data);
	}, [data]);

	return (
		<div className="w-full h-full overflow-hidden">
			<AgGridReact
				ref={gridRef}
				rowData={rowData}
				columnDefs={colDefs as any}
				domLayout="normal"
				pagination={true}
				paginationPageSize={pageSize}
				paginationPageSizeSelector={paginationOptions}
				suppressPaginationPanel={true}
				className="w-full h-full"
				theme={autumnTheme}
				defaultColDef={{
					flex: 1,
					resizable: true,
					sortable: true,
					filter: true,
				}}
				onRowClicked={(event) => {
					setEvent(event.data as IRow);
					setIsOpen(true);
				}}
				onRowDataUpdated={(event: RowDataUpdatedEvent) => {
					setTotalRows(event.api.paginationGetRowCount());
				}}
				onPaginationChanged={(event: PaginationChangedEvent) => {
					setTotalPages(event.api.paginationGetTotalPages());
					setCurrentPage(event.api.paginationGetCurrentPage() + 1);
				}}
			/>
			{event && (
				<RowClickDialog event={event} isOpen={isOpen} setIsOpen={setIsOpen} />
			)}
		</div>
	);
}
