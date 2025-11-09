"use client";

import type { Event } from "@autumn/shared";
import { useMemo } from "react";
import { Bar, BarChart, CartesianGrid, XAxis, YAxis } from "recharts";
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
} from "@/components/ui/chart";
import { prepareChartData } from "./customerUsageAnalyticsUtils";

export function CustomerUsageAnalyticsChart({
  events,
  daysToShow = 7,
}: {
  events: Event[];
  daysToShow?: number;
}) {
  const { chartData, chartConfig, eventNames, maxValue } = useMemo(
    () => prepareChartData({ events, daysToShow }),
    [events, daysToShow]
  );

  return (
    <ChartContainer
      config={chartConfig}
      className="max-h-[300px] border border-border-table pl-0 mb-4 p-2 rounded-2xl"
    >
      <BarChart
        accessibilityLayer
        data={chartData}
        className="[&_.recharts-cartesian-grid-bg]:fill-white dark:[&_.recharts-cartesian-grid-bg]:fill-gray-900 [&_.recharts-cartesian-grid-bg]:stroke-border [&_.recharts-cartesian-grid-bg]:stroke-1 [&_.recharts-cartesian-grid-bg]:[rx:8px]"
        barCategoryGap={4}
      >
        <CartesianGrid
          vertical={false}
          className="fill-white dark:fill-gray-900 "
        />
        <XAxis
          dataKey="date"
          tickLine={false}
          tickMargin={10}
          axisLine={false}
        />
        <YAxis
          domain={[0, Math.round(maxValue * 1.2)]}
          tickCount={5}
          tickLine={false}
          axisLine={false}
          width={16}
        />
        <ChartTooltip content={<ChartTooltipContent />} />
        {eventNames.map((eventName: string, index: number) => (
          <Bar
            key={eventName}
            dataKey={eventName}
            stackId="a"
            fill={`var(--color-${eventName})`}
            radius={
              index === eventNames.length - 1 ? [4, 4, 0, 0] : [0, 0, 0, 0]
            }
          />
        ))}
      </BarChart>
    </ChartContainer>
  );
}
