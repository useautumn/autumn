import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { IRow } from "./AGGrid";
import { CopyablePre } from "@/components/general/CopyablePre";

export function RowClickDialog({
  event,
  isOpen,
  setIsOpen,
}: {
  event: IRow;
  isOpen: boolean;
  setIsOpen: (isOpen: boolean) => void;
}) {
  return (
    <Dialog open={isOpen} onOpenChange={setIsOpen}>
      <DialogHeader>
        <DialogTitle className="text-xl font-bold tracking-tight">
          Event Details
        </DialogTitle>
      </DialogHeader>

      <DialogContent
        className="sm:max-w-[600px] p-2"
        aria-describedby="Event Details"
      >
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
        {/* <div className="flex flex-col gap-4">
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
          </div> */}
      </DialogContent>
    </Dialog>
  );
}
