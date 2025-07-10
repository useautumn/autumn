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
  BrutalChartContainer,
  BrutalChartTooltip,
  BrutalChartTooltipContent,
  BrutalChartLegend,
  BrutalChartLegendContent,
  BrutalChartStyle,
  BrutalChartConfig,
} from "@/components/ui/brutal-chart";
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
  console.log(chartData);

  return (
    <ChartContainer config={chartConfig} className="max-h-[300px] w-full">
      <BarChart
        accessibilityLayer
        data={chartData}
        // margin={{ top: 20, right: 30, left: 20, bottom: 20 }}
        className="pl-0"
      >
        <CartesianGrid vertical={false} />
        <XAxis
          dataKey="interval_start"
          tickLine={true}
          tickMargin={10}
          axisLine={false}
          tickFormatter={(value) => {
            const date = new Date(value);
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
                const date = new Date(value);
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
              barSize={40}
              className="bg-primary"
            />
          );
        })}
      </BarChart>
    </ChartContainer>
  );
}
