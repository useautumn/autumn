"use client";

import * as React from "react";
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  XAxis,
  YAxis,
  ResponsiveContainer,
} from "recharts";

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  ChartConfig,
  ChartContainer,
  ChartLegend,
  ChartLegendContent,
  ChartTooltip,
  ChartTooltipContent,
} from "@/components/ui/chart";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  AllCommunityModule,
  ColDef,
  ModuleRegistry,
  ValidationModule,
  themeQuartz,
  themeMaterial,
  themeAlpine,
} from "ag-grid-community";
import {
  AgChartOptions,
  AgFlowProportionChartOptions,
  AgStandaloneChartOptions,
} from "ag-charts-community";
import { AgCharts } from "ag-charts-react";

// Register all Community features

import { AgGridReact } from "ag-grid-react";
import { useEffect, useState } from "react";

export const description = "An interactive area chart";

export type Row =
  | {
      interval_start: string;
    }
  | {
      [key: string]: number;
    };

export interface IRow {
  timestamp: string;
  event_name: string;
  value: number;
}

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
  const [options, setOptions] = useState<AgChartOptions>({
    data: data.data,
    series: chartConfig,
    theme: {
      palette: {
        fills: ["#9c5aff", "#a97eff", "#8268ff", "#7571ff", "#687aff", "#5b83ff", "#4e8cff", "#4195ff", "#349eff", "#27a7ff"],
      },
    },
  });

  const chartData = data.data;
  console.log("AgCharts data:", chartData);
  console.log("AgCharts config:", chartConfig);

  useEffect(() => {
    setOptions({
      ...options,
      data: data.data,
      series: chartConfig,
    });
  }, [chartConfig, data]);

  return <AgCharts options={options} />;

  // return (
  //   <ChartContainer
  //     config={chartConfig}
  //     className="max-h-[300px] w-full overflow-x-hidden"
  //   >
  //     <BarChart
  //       accessibilityLayer
  //       data={chartData}
  //       // margin={{ top: 20, right: 30, left: 20, bottom: 20 }}
  //       className="pr-5"
  //     >
  //       <CartesianGrid vertical={false} />
  //       <XAxis
  //         dataKey="interval_start"
  //         tickLine={true}
  //         tickMargin={10}
  //         axisLine={false}
  //         tickFormatter={(value) => {
  //           const date = new Date(value);
  //           return date.toLocaleDateString("en-US", {
  //             month: "short",
  //             day: "numeric",
  //           });
  //         }}
  //       />
  //       <YAxis
  //         tickLine={true}
  //         tickMargin={10}
  //         axisLine={false}
  //         tickFormatter={(value) => {
  //           return value.toLocaleString();
  //         }}
  //       />

  //       <ChartTooltip
  //         content={
  //           <ChartTooltipContent
  //             labelFormatter={(value) => {
  //               const date = new Date(value);
  //               return date.toLocaleDateString("en-US", {
  //                 month: "short",
  //                 day: "numeric",
  //               });
  //             }}
  //           />
  //         }
  //       />
  //       {Object.keys(chartConfig).map((key) => {
  //         return (
  //           <Bar
  //             key={key}
  //             dataKey={key}
  //             stackId="events"
  //             fill={chartConfig[key].color}
  //             radius={[4, 4, 0, 0]}
  //             barSize={40}
  //             className="bg-primary"
  //           />
  //         );
  //       })}
  //     </BarChart>
  //   </ChartContainer>
  // );
}

export function EventsAGGrid({ data }: { data: any }) {
  const [rowData, setRowData] = useState<IRow[]>([]);
  const [colDefs, setColDefs] = useState<ColDef<IRow>[]>([
    { field: "timestamp", flex: 1 },
    { field: "event_name", flex: 1 },
    { field: "value", flex: 1 },
  ]);

  ModuleRegistry.registerModules([AllCommunityModule, ValidationModule]);

  useEffect(() => {
    setRowData(data.data);
    console.log("rowData", rowData);
  }, [data]);

  return (
    <div className="w-full h-full overflow-hidden">
      <AgGridReact
        rowData={rowData}
        columnDefs={colDefs as any}
        domLayout="normal"
        pagination={true}
        paginationPageSize={500}
        paginationPageSizeSelector={[10, 100, 500, 1000]}
        className="w-full h-full"
        theme={themeQuartz}
        defaultColDef={{
          flex: 1,
          resizable: true,
          sortable: true,
          filter: true,
        }}
      />
    </div>
  );
}
