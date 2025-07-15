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
  FormatterParams,
} from "ag-charts-community";
import { AgCharts } from "ag-charts-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

// Register all Community features

import { AgGridReact } from "ag-grid-react";
import { useEffect, useState } from "react";
import { Copy } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { CopyablePre } from "@/components/general/CopyablePre";
import { IRow, Row, autumnTheme } from "./components/AGGrid";
import { useAnalyticsContext } from "./AnalyticsContext";
import { Feature } from "@autumn/shared";

const dateFormatter = new Intl.DateTimeFormat(navigator.language || "en-US", {
  month: "short",
  day: "numeric",
});

const hourFormatter = new Intl.DateTimeFormat(navigator.language || "en-US", {
  hour: "numeric",
  minute: "numeric",
});

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
    formatter: {
      x: (params: FormatterParams<any, unknown>) => {
        if (params.type !== "category") return;
        return selectedInterval === "24h"
          ? hourFormatter.format(new Date(params.value as string))
          : dateFormatter.format(new Date(params.value as string));
      }
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
}

export function EventsAGGrid({ data }: { data: any }) {
  const [rowData, setRowData] = useState<IRow[]>([]);
  const [isOpen, setIsOpen] = useState(false);
  const [event, setEvent] = useState<IRow | null>(null);
  const [colDefs] = useState<ColDef<IRow>[]>([
    { field: "timestamp", flex: 1 },
    { field: "event_name", flex: 1 },
    { field: "value", flex: 1 },
    { field: "properties", flex: 1 },
  ]);

  ModuleRegistry.registerModules([AllCommunityModule, ValidationModule]);

  useEffect(() => {
    setRowData(data.data);
    console.log("rowData", rowData);
  }, [data]);

  return (
    <div className="w-full h-full overflow-hidden px-3">
      <AgGridReact
        rowData={rowData}
        columnDefs={colDefs as any}
        domLayout="normal"
        pagination={true}
        paginationPageSize={500}
        paginationPageSizeSelector={[10, 100, 500, 1000]}
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
      />
      {event && (
        <RowClickDialog event={event} isOpen={isOpen} setIsOpen={setIsOpen} />
      )}
    </div>
  );
}

export function RowClickDialog({
  event,
  isOpen,
  setIsOpen,
}: {
  event: IRow;
  isOpen: boolean;
  setIsOpen: (isOpen: boolean) => void;
}) {
  console.log("event", event);

  return (
    <Dialog open={isOpen} onOpenChange={setIsOpen}>
      <DialogHeader>
        <DialogTitle className="text-xl font-bold tracking-tight">
          Event Details
        </DialogTitle>
      </DialogHeader>

      <DialogContent
        className="sm:max-w-[600px]"
        aria-describedby="Event Details"
      >
        <div className="flex flex-col gap-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-4">
              <div>
                <p className="text-sm font-semibold text-muted-foreground">
                  Event Name
                </p>
                <p className="text-lg font-medium">{event.event_name}</p>
              </div>
              <div>
                <p className="text-sm font-semibold text-muted-foreground">
                  Event Value
                </p>
                <p className="text-lg font-medium">{event.value}</p>
              </div>
              <div>
                <p className="text-sm font-semibold text-muted-foreground">
                  Event Properties
                </p>
                <CopyablePre
                  text={JSON.stringify(JSON.parse(event.properties), null, 2)}
                />
              </div>
            </div>

            <div className="space-y-4">
              <div>
                <p className="text-sm font-semibold text-muted-foreground">
                  Idempotency Key
                </p>
                <p className="text-lg font-medium">
                  {event.idempotency_key || "N/A"}
                </p>
              </div>

              <div>
                <p className="text-sm font-semibold text-muted-foreground">
                  Entity ID
                </p>
                <p className="text-lg font-medium">
                  {event.entity_id || "N/A"}
                </p>
              </div>

              <div>
                <p className="text-sm font-semibold text-muted-foreground">
                  Customer ID
                </p>
                <p className="text-lg font-medium">
                  {event.customer_id || "N/A"}
                </p>
              </div>
            </div>
          </div>

          <Accordion type="single" collapsible className="w-full">
            <AccordionItem value="item-1">
              <AccordionTrigger>Raw Event</AccordionTrigger>
              <AccordionContent>
                <CopyablePre
                  text={JSON.stringify(
                    {
                      ...event,
                      properties: JSON.parse(event.properties),
                    },
                    null,
                    4,
                  )}
                />
              </AccordionContent>
            </AccordionItem>
          </Accordion>
        </div>
      </DialogContent>
    </Dialog>
  );
}
