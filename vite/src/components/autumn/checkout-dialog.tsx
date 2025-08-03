"use client";
import * as AccordionPrimitive from "@radix-ui/react-accordion";
import React, { useEffect, useState } from "react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogTitle,
} from "@/components/ui/dialog";
import { getCheckoutContent } from "@/lib/autumn/checkout-content";
import { useCustomer } from "autumn-js/react";
import { ArrowRight, ChevronDown, Loader2 } from "lucide-react";
import type { CheckoutResult, ProductItem } from "autumn-js";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
} from "@/components/ui/accordion";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Input } from "@/components/ui/input";

export interface CheckoutDialogProps {
  open: boolean;
  setOpen: (open: boolean) => void;
  checkoutResult: CheckoutResult;
}

const formatCurrency = ({
  amount,
  currency,
}: {
  amount: number;
  currency: string;
}) => {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: currency,
  }).format(amount);
};

export default function CheckoutDialog(params: CheckoutDialogProps) {
  const { attach } = useCustomer();
  const [checkoutResult, setCheckoutResult] = useState<
    CheckoutResult | undefined
  >(params?.checkoutResult);

  useEffect(() => {
    if (params.checkoutResult) {
      setCheckoutResult(params.checkoutResult);
    }
  }, [params.checkoutResult]);

  const [loading, setLoading] = useState(false);

  if (!checkoutResult) {
    return <></>;
  }

  const { open, setOpen } = params;
  const { title, message } = getCheckoutContent(checkoutResult);

  const isFree = checkoutResult?.product.properties?.is_free;
  const isPaid = isFree === false;

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent className="p-0 pt-4 gap-0 text-foreground overflow-hidden text-sm">
        <DialogTitle className="px-6 mb-1">{title}</DialogTitle>
        <div className="px-6 mt-1 mb-4 text-muted-foreground">
          {message}
        </div>

        {isPaid && checkoutResult && (
          <PriceInformation
            checkoutResult={checkoutResult}
            setCheckoutResult={setCheckoutResult}
          />
        )}

        <DialogFooter className="flex flex-col sm:flex-row justify-between gap-x-4 py-2 pl-6 pr-3 bg-secondary border-t shadow-inner">
          <Button
            size="sm"
            onClick={async () => {
              setLoading(true);

              const options = checkoutResult.options.map((option) => {
                return {
                  featureId: option.feature_id,
                  quantity: option.quantity,
                };
              });

              await attach({
                productId: checkoutResult.product.id,
                options,
              });
              setOpen(false);
              setLoading(false);
            }}
            disabled={loading}
            className="min-w-16 flex items-center gap-2"
          >
            {loading ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <>
                <span className="whitespace-nowrap flex gap-1">
                  Confirm
                </span>
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function PriceInformation({
  checkoutResult,
  setCheckoutResult,
}: {
  checkoutResult: CheckoutResult;
  setCheckoutResult: (checkoutResult: CheckoutResult) => void;
}) {
  return (
    <div className="px-6 mb-4 flex flex-col gap-4">
      <ProductItems
        checkoutResult={checkoutResult}
        setCheckoutResult={setCheckoutResult}
      />

      <div className="flex flex-col gap-2">
        {checkoutResult?.has_prorations && checkoutResult.lines.length > 0 && (
          <CheckoutLines checkoutResult={checkoutResult} />
        )}
        <DueAmounts checkoutResult={checkoutResult} />
      </div>
    </div>
  );
}

function DueAmounts({ checkoutResult }: { checkoutResult: CheckoutResult }) {
  const { next_cycle, product } = checkoutResult;
  const nextCycleAtStr = next_cycle
    ? new Date(next_cycle.starts_at).toLocaleDateString()
    : undefined;

  const hasUsagePrice = product.items.some(
    (item) => item.usage_model === "pay_per_use"
  );

  const showNextCycle = next_cycle && next_cycle.total !== checkoutResult.total;

  return (
    <div className="flex flex-col gap-1">
      <div className="flex justify-between">
        <div>
          <p className="font-medium text-md">Total due today</p>
        </div>

        <p className="font-medium text-md">
          {formatCurrency({
            amount: checkoutResult?.total,
            currency: checkoutResult?.currency,
          })}
        </p>
      </div>
      {showNextCycle && (
        <div className="flex justify-between text-muted-foreground">
          <div>
            <p className="text-md">Due next cycle ({nextCycleAtStr})</p>
          </div>
          <p className="text-md">
            {formatCurrency({
              amount: next_cycle.total,
              currency: checkoutResult?.currency,
            })}
            {hasUsagePrice && <span> + usage prices</span>}
          </p>
        </div>
      )}
    </div>
  );
}

function ProductItems({
  checkoutResult,
  setCheckoutResult,
}: {
  checkoutResult: CheckoutResult;
  setCheckoutResult: (checkoutResult: CheckoutResult) => void;
}) {
  const isUpdateQuantity =
    checkoutResult?.product.scenario === "active" &&
    checkoutResult.product.properties.updateable;
  return (
    <div className="flex flex-col gap-2">
      <p className="text-sm font-medium">Price</p>
      {checkoutResult?.product.items
        .filter((item) => item.type !== "feature")
        .map((item, index) => {
          if (item.usage_model == "prepaid") {
            return (
              <PrepaidItem
                key={index}
                item={item}
                checkoutResult={checkoutResult!}
                setCheckoutResult={setCheckoutResult}
              />
            );
          }

          if (isUpdateQuantity) {
            return null;
          }

          return (
            <div key={index} className="flex justify-between">
              <p className="text-muted-foreground">
                {item.feature ? item.feature.name : "Subscription"}
              </p>
              <p>
                {item.display?.primary_text} {item.display?.secondary_text}
              </p>
            </div>
          );
        })}
    </div>
  );
}

function CheckoutLines({ checkoutResult }: { checkoutResult: CheckoutResult }) {
  return (
    <Accordion type="single" collapsible>
      <AccordionItem value="total" className="border-b-0">
        <CustomAccordionTrigger className="justify-between w-full my-0 py-0 border-none">
          <div className="cursor-pointer flex items-center gap-1 w-full justify-end">
            <p className="font-light text-muted-foreground">
              View details
            </p>
            <ChevronDown
              className="text-muted-foreground mt-0.5 rotate-90 transition-transform duration-200 ease-in-out"
              size={14}
            />
          </div>
        </CustomAccordionTrigger>
        <AccordionContent className="mt-2 mb-0 pb-2 flex flex-col gap-2">
          {checkoutResult?.lines
            .filter((line) => line.amount != 0)
            .map((line, index) => {
              return (
                <div key={index} className="flex justify-between">
                  <p className="text-muted-foreground">{line.description}</p>
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

const PrepaidItem = ({
  item,
  checkoutResult,
  setCheckoutResult,
}: {
  item: ProductItem;
  checkoutResult: CheckoutResult;
  setCheckoutResult: (checkoutResult: CheckoutResult) => void;
}) => {
  const { quantity = 0, billing_units: billingUnits = 1 } = item;
  const [quantityInput, setQuantityInput] = useState<string>(
    (quantity / billingUnits).toString()
  );
  const { checkout } = useCustomer();
  const [loading, setLoading] = useState(false);
  const [open, setOpen] = useState(false);
  const scenario = checkoutResult.product.scenario;

  const handleSave = async () => {
    setLoading(true);
    try {
      const newOptions = checkoutResult.options
        .filter((option) => option.feature_id !== item.feature_id)
        .map((option) => {
          return {
            featureId: option.feature_id,
            quantity: option.quantity,
          };
        });

      newOptions.push({
        featureId: item.feature_id!,
        quantity: Number(quantityInput) * billingUnits,
      });

      const { data, error } = await checkout({
        productId: checkoutResult.product.id,
        options: newOptions,
      });

      if (error) {
        console.error(error);
        return;
      }
      setCheckoutResult(data!);
    } catch (error) {
      console.error(error);
    } finally {
      setLoading(false);
      setOpen(false);
    }
  };

  const disableSelection = scenario === "renew";

  return (
    <div className="flex justify-between">
      <div className="flex gap-2">
        <p className="text-muted-foreground">{item.feature?.name}</p>
        <Popover open={open} onOpenChange={setOpen}>
          <PopoverTrigger
            className={cn(
              "text-muted-foreground text-xs px-1 py-0.5 rounded-md flex items-center gap-1 bg-accent/80",
              disableSelection !== true &&
                "hover:bg-accent hover:text-foreground"
            )}
            disabled={disableSelection}
          >
            Qty: {quantity}
            <ChevronDown size={12} />
          </PopoverTrigger>
          <PopoverContent
            align="start"
            className="w-80 text-sm p-4 pt-3 flex flex-col gap-4"
          >
            <div className="flex flex-col gap-1">
              <p className="text-sm font-medium">{item.feature?.name}</p>
              <p className="text-muted-foreground">
                {item.display?.primary_text} {item.display?.secondary_text}
              </p>
            </div>

            <div className="flex justify-between items-end">
              <div className="flex gap-2 items-center">
                <Input
                  className="h-7 w-16 focus:!ring-2"
                  value={quantityInput}
                  onChange={(e) => setQuantityInput(e.target.value)}
                />
                <p className="text-muted-foreground">
                  {billingUnits > 1 && `x ${billingUnits} `}
                  {item.feature?.name}
                </p>
              </div>

              <Button
                onClick={handleSave}
                className="w-14 !h-7 text-sm items-center bg-white text-foreground shadow-sm border border-zinc-200 hover:bg-zinc-100"
                disabled={loading}
              >
                {loading ? (
                  <Loader2 className="text-muted-foreground animate-spin !w-4 !h-4" />
                ) : (
                  "Save"
                )}
              </Button>
            </div>
          </PopoverContent>
        </Popover>
      </div>
      <p>
        {item.display?.primary_text} {item.display?.secondary_text}
      </p>
    </div>
  );
};

export const PriceItem = ({
  children,
  className,
  ...props
}: {
  children: React.ReactNode;
  className?: string;
} & React.HTMLAttributes<HTMLDivElement>) => {
  return (
    <div
      className={cn(
        "flex flex-col pb-4 sm:pb-0 gap-1 sm:flex-row justify-between sm:h-7 sm:gap-2 sm:items-center",
        className
      )}
      {...props}
    >
      {children}
    </div>
  );
};

export const PricingDialogButton = ({
  children,
  size,
  onClick,
  disabled,
  className,
}: {
  children: React.ReactNode;
  size?: "sm" | "lg" | "default" | "icon";
  onClick: () => void;
  disabled?: boolean;
  className?: string;
}) => {
  return (
    <Button
      onClick={onClick}
      disabled={disabled}
      size={size}
      className={cn(className, "shadow-sm shadow-stone-400")}
    >
      {children}
      <ArrowRight className="!h-3" />
    </Button>
  );
};
