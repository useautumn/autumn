import {
  AllCommunityModule,
  ColDef,
  ModuleRegistry,
  ValidationModule,
  ValueFormatterParams,
  RowDataUpdatedEvent,
  PaginationChangedEvent,
} from "ag-grid-community";
import { AgChartOptions, FormatterParams } from "ag-charts-community";
import { AgCharts } from "ag-charts-react";

// Register all Community features

import { AgGridReact } from "ag-grid-react";
import { useEffect, useState } from "react";
import { IRow, Row, autumnTheme, paginationOptions } from "./components/AGGrid";
import { useAnalyticsContext } from "./AnalyticsContext";
import { RowClickDialog } from "./components/RowClickDialog";

const dateFormatter = new Intl.DateTimeFormat(navigator.language || "en-US", {
  month: "short",
  day: "numeric",
});

const hourFormatter = new Intl.DateTimeFormat(navigator.language || "en-US", {
  hour: "numeric",
  minute: "numeric",
});

const timestampFormatter = new Intl.DateTimeFormat(
  navigator.language || "en-US",
  {
    month: "long",
    day: "numeric",
    hour: "numeric",
    minute: "numeric",
    second: "numeric",
  }
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
          ? hourFormatter.format(new Date(params.value as string))
          : dateFormatter.format(new Date(params.value as string));
      },
    },
    legend: {
      enabled: true,
    },
  });

  const chartData = data.data;

  useEffect(() => {
    setOptions({
      ...options,
      data: data.data,
      series: chartConfig,
    });
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
        return timestampFormatter.format(new Date(params.value as string));
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
