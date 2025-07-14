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
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { CopyablePre } from "@/components/general/CopyablePre";

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
  properties: any;
  idempotency_key: string;
  entity_id: string;
  customer_id: string;
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
  const [colDefs, setColDefs] = useState<ColDef<IRow>[]>([
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
        theme={themeQuartz}
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

      <DialogContent className="sm:max-w-[600px]">
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
                <CopyablePre text={JSON.stringify(JSON.parse(event.properties), null, 2)} />
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

          <Accordion
            type="single"
            collapsible
            className="w-full"
          >
            <AccordionItem value="item-1">
              <AccordionTrigger>Raw Event</AccordionTrigger>
              <AccordionContent>
                <CopyablePre text={JSON.stringify({
                  ...event,
                  properties: JSON.parse(event.properties),
                }, null, 4)} />
              </AccordionContent>
            </AccordionItem>
          </Accordion>
        </div>
      </DialogContent>
    </Dialog>
  );
}
