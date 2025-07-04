"use client";

import React, { useEffect, useState } from "react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { ArrowRight, Loader2 } from "lucide-react";
import { type CheckProductPreview } from "autumn-js";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogTitle,
} from "@/components/ui/dialog";
import { getAttachContent } from "@/lib/autumn/attach-content";
import { useCustomer } from "autumn-js/react";

export interface AttachDialogProps {
  open: boolean;
  setOpen: (open: boolean) => void;
  preview: CheckProductPreview;
  onClick: (options?: any) => Promise<void>;
}

export default function AttachDialog(params?: AttachDialogProps) {
  const { attach } = useCustomer();
  const [loading, setLoading] = useState(false);
  const [optionsInput, setOptionsInput] = useState<FeatureOption[]>(
    params?.preview?.options || []
  );

  const getTotalPrice = () => {
    let sum = due_today?.price || 0;
    optionsInput.forEach((option) => {
      if (option.price && option.quantity) {
        sum += option.price * (option.quantity / option.billing_units);
      }
    });
    return sum;
  };

  useEffect(() => {
    setOptionsInput(params?.preview?.options || []);
  }, [params?.preview?.options]);

  if (!params || !params.preview) {
    return <></>;
  }

  const { open, setOpen, preview } = params;
  const { items, due_today } = preview;
  const { title, message } = getAttachContent(preview);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent
        className={cn(
          "p-0 pt-4 gap-0 text-foreground overflow-hidden text-sm"
        )}
      >
        <DialogTitle className={cn("px-6 mb-1 ")}>{title}</DialogTitle>
        <div className={cn("px-6 mt-1 mb-4 text-muted-foreground")}>
          {message}
        </div>
        {(items || optionsInput.length > 0) && (
          <div className="mb-6 px-6">
            {items?.map((item) => (
              <PriceItem key={item.description}>
                <span className="truncate flex-1">
                  {item.description}
                </span>
                <span>{item.price}</span>
              </PriceItem>
            ))}

            {optionsInput?.map((option, index) => {
              return (
                <OptionsInput
                  key={option.feature_name}
                  option={option as FeatureOptionWithRequiredPrice}
                  optionsInput={optionsInput}
                  setOptionsInput={setOptionsInput}
                  index={index}
                />
              );
            })}
          </div>
        )}

        <DialogFooter className="flex flex-col sm:flex-row justify-between gap-x-4 py-2 pl-6 pr-3 bg-secondary border-t shadow-inner">
          {due_today && (
            <TotalPrice>
              <span>Due Today</span>
              <span>
                {new Intl.NumberFormat("en-US", {
                  style: "currency",
                  currency: due_today.currency,
                }).format(getTotalPrice())}
              </span>
            </TotalPrice>
          )}
          <Button
            size="sm"
            onClick={async () => {
              setLoading(true);
              await attach({
                productId: preview.product_id,
                options: optionsInput.map((option) => ({
                  featureId: option.feature_id,
                  quantity: option.quantity || 0,
                })),
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

interface FeatureOption {
  feature_id: string;
  feature_name: string;
  billing_units: number;
  price?: number;
  quantity?: number;
}

interface FeatureOptionWithRequiredPrice
  extends Omit<FeatureOption, "price" | "quantity"> {
  price: number;
  quantity: number;
}

export const OptionsInput = ({
  className,
  option,
  optionsInput,
  setOptionsInput,
  index,
  ...props
}: {
  className?: string;
  option: FeatureOptionWithRequiredPrice;
  optionsInput: FeatureOption[];
  setOptionsInput: (options: FeatureOption[]) => void;
  index: number;
} & React.HTMLAttributes<HTMLDivElement>) => {
  const { feature_name, billing_units, quantity, price } = option;
  return (
    <PriceItem key={feature_name}>
      <span>{feature_name}</span>
      <QuantityInput
        key={feature_name}
        value={quantity ? quantity / billing_units : ""}
        onChange={(e: React.ChangeEvent<HTMLInputElement>) => {
          const newOptions = [...optionsInput];
          newOptions[index].quantity = parseInt(e.target.value) * billing_units;
          setOptionsInput(newOptions);
        }}
      >
        <span className="">
          × ${price} per {billing_units === 1 ? " " : billing_units}{" "}
          {feature_name}
        </span>
      </QuantityInput>
    </PriceItem>
  );
};

export const QuantityInput = ({
  children,
  onChange,
  value,
  className,
  ...props
}: {
  children: React.ReactNode;
  value: string | number;
  onChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
  className?: string;
} & React.HTMLAttributes<HTMLDivElement>) => {
  const currentValue = Number(value) || 0;

  const handleValueChange = (newValue: number) => {
    const syntheticEvent = {
      target: { value: String(newValue) },
    } as React.ChangeEvent<HTMLInputElement>;
    onChange(syntheticEvent);
  };

  return (
    <div
      className={cn(className, "flex flex-row items-center gap-4")}
      {...props}
    >
      <div className="flex items-center gap-1">
        <Button
          variant="outline"
          size="icon"
          onClick={() =>
            currentValue > 0 && handleValueChange(currentValue - 1)
          }
          disabled={currentValue <= 0}
          className="h-6 w-6 pb-0.5"
        >
          -
        </Button>
        <span className="w-8 text-center text-foreground">
          {currentValue}
        </span>
        <Button
          variant="outline"
          size="icon"
          onClick={() => handleValueChange(currentValue + 1)}
          className="h-6 w-6 pb-0.5"
        >
          +
        </Button>
      </div>
      {children}
    </div>
  );
};

export const TotalPrice = ({ children }: { children: React.ReactNode }) => {
  return (
    <div className="w-full font-semibold flex justify-between items-center">
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
