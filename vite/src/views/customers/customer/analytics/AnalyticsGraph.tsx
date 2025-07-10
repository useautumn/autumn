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
  ResponsiveContainer
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

export const description = "An interactive area chart";

export type Row =
  | {
      interval_start: string;
    }
  | {
      [key: string]: number;
    };

export function EventsBarChart({
  data,
  chartConfig,
}: {
  data: {
    meta: any[];
    rows: number;
    data: Row[];
  };
  chartConfig: ChartConfig;
}) {
  const chartData = data.data;

  console.log(chartData, chartConfig);

  return (
    <ChartContainer config={chartConfig} className="w-full h-full">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart 
          accessibilityLayer 
          data={chartData}
        >
          <CartesianGrid vertical={true} />
          <XAxis
            dataKey="interval_start"
            tickLine={true}
            tickMargin={10}
            axisLine={false}
            tickFormatter={(value) => {
              let date = new Date(value);
              return date.toLocaleDateString("en-US", {
                month: "short",
                day: "numeric",
              });
            }}
          />
          <YAxis
            tickLine={true}
            tickMargin={10}
            axisLine={false}
            tickFormatter={(value) => {
              return value.toLocaleString();
            }}
          />

          <ChartTooltip
            content={
              <ChartTooltipContent
                labelFormatter={(value) => {
                  let date = new Date(value);
                  return date.toLocaleDateString("en-US", {
                    month: "short",
                    day: "numeric",
                  });
                }}
              />
            }
          />
          {Object.keys(chartConfig).map((key) => {
            return (
              <Bar
                key={key}
                dataKey={key}
                stackId="events"
                fill={chartConfig[key].color}
                radius={[4, 4, 0, 0]}
                barSize={100}
              />
            );
          })}
        </BarChart>
      </ResponsiveContainer>
    </ChartContainer>
  );
}
