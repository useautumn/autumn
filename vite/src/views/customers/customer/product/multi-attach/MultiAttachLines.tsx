import {
  Accordion,
  AccordionContent,
  AccordionItem,
} from "@/components/ui/accordion";
import { CheckoutResult } from "autumn-js";
import { ChevronDown } from "lucide-react";

import * as AccordionPrimitive from "@radix-ui/react-accordion";
import { cn } from "@/lib/utils";

export function MultiAtttachLines({
  checkoutResult,
}: {
  checkoutResult: CheckoutResult;
}) {
  return (
    <Accordion type="single" collapsible>
      <AccordionItem value="total" className="border-b-0">
        <CustomAccordionTrigger className="justify-between w-full my-0 py-0 border-none">
          <div className="cursor-pointer flex items-center gap-1 w-full justify-start">
            <p className="font-regular text-muted-foreground">View details</p>
            <ChevronDown
              className="text-muted-foreground mt-0.5 rotate-90 transition-transform duration-200 ease-in-out"
              size={14}
            />
          </div>
        </CustomAccordionTrigger>
        <AccordionContent className="mt-2 mb-0 pb-2 flex flex-col gap-2">
          {checkoutResult?.lines
            // .filter((line) => line.amount != 0)
            .map((line, index) => {
              return (
                <div key={index} className="flex justify-between">
                  <p className="text-muted-foreground max-w-72">
                    {line.description}
                  </p>
                  <p className="text-muted-foreground">
                    {new Intl.NumberFormat("en-US", {
                      style: "currency",
                      currency: checkoutResult?.currency,
                    }).format(line.amount)}
                  </p>
                </div>
              );
            })}
        </AccordionContent>
      </AccordionItem>
    </Accordion>
  );
}

function CustomAccordionTrigger({
  className,
  children,
  ...props
}: React.ComponentProps<typeof AccordionPrimitive.Trigger>) {
  return (
    <AccordionPrimitive.Header className="flex">
      <AccordionPrimitive.Trigger
        data-slot="accordion-trigger"
        className={cn(
          "focus-visible:border-ring focus-visible:ring-ring/50 flex flex-1 items-start justify-between gap-4 rounded-md py-4 text-left text-sm font-medium transition-all outline-none focus-visible:ring-[3px] disabled:pointer-events-none disabled:opacity-50 [&[data-state=open]_svg]:rotate-0",
          className
        )}
        {...props}
      >
        {children}
      </AccordionPrimitive.Trigger>
    </AccordionPrimitive.Header>
  );
}
