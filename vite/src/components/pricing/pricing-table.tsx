"use client";

import React from "react";
import { createContext, useContext, useState } from "react";
import { cn } from "@/lib/utils";
import { Switch } from "@/components/ui/switch";
import { Button } from "@/components/ui/button";
import { Check, Loader2 } from "lucide-react";

// Update Product interface to match dev/classic
export interface Product {
  id: string;
  name: string;
  description?: string;
  everythingFrom?: string;

  buttonText?: string;
  buttonUrl?: string;

  recommendedText?: string;

  price: {
    primaryText: string;
    secondaryText?: string;
  };

  priceAnnual?: {
    primaryText: string;
    secondaryText?: string;
  };

  items: {
    primaryText: string;
    secondaryText?: string;
  }[];
}

// Update context to include showFeatures
const PricingTableContext = createContext<{
  isAnnual: boolean;
  setIsAnnual: (isAnnual: boolean) => void;
  products: Product[];
  showFeatures: boolean;
  uniform: boolean;
}>({
  isAnnual: false,
  setIsAnnual: () => {},
  products: [],
  showFeatures: true,
  uniform: false,
});

export const usePricingTableContext = (componentName: string) => {
  const context = useContext(PricingTableContext);

  if (context === undefined) {
    throw new Error(`${componentName} must be used within <PricingTable />`);
  }

  return context;
};

export const PricingTable = ({
  children,
  products,
  showFeatures = true,
  className,
  uniform = false,
}: {
  children?: React.ReactNode;
  products?: Product[];
  showFeatures?: boolean;
  className?: string;
  uniform?: boolean;
}) => {
  const [isAnnual, setIsAnnual] = useState(false);

  if (!products) {
    throw new Error("products is required in <PricingTable />");
  }

  return (
    <PricingTableContext.Provider
      value={{ isAnnual, setIsAnnual, products, showFeatures, uniform }}
    >
      <div className={cn("flex items-center flex-col")}>
        {products.some((p) => p.priceAnnual) && (
          <div
            className={cn(
              products.some((p) => p.recommendedText) && !uniform && "mb-8"
            )}
          >
            <AnnualSwitch isAnnual={isAnnual} setIsAnnual={setIsAnnual} />
          </div>
        )}
        <div
          className={cn(
            "grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-none lg:auto-cols-[minmax(200px,1fr)] lg:grid-flow-col gap-4 w-full",
            className
          )}
        >
          {children}
        </div>
      </div>
    </PricingTableContext.Provider>
  );
};

interface PricingCardProps {
  productId: string;
  className?: string;
  onButtonClick?: (event: React.MouseEvent<HTMLButtonElement>) => void;
  buttonProps?: React.ComponentProps<"button">;
}

export const PricingCard = ({
  productId,
  className,
  onButtonClick,
  buttonProps,
}: PricingCardProps) => {
  const { isAnnual, products, showFeatures, uniform } =
    usePricingTableContext("PricingCard");
  const product = products.find((p) => p.id === productId);

  if (!product) {
    throw new Error(`Product with id ${productId} not found`);
  }

  const {
    name,
    price,
    priceAnnual,
    recommendedText,
    buttonText,
    items,
    description,
    buttonUrl,
    everythingFrom,
  } = product;

  const isRecommended = recommendedText ? true : false;

  return (
    <div
      className={cn(
        "border rounded-md bg-background w-full h-full pt-6 text-foreground",
        recommendedText &&
          !uniform &&
          "shadow-xl border-primary/30 lg:-translate-y-6 lg:h-[calc(100%+48px)] relative",
        className
      )}
    >
      {recommendedText && !uniform && (
        <RecommendedBadge recommended={recommendedText} />
      )}
      <div
        className={cn(
          "px-6",
          recommendedText && !uniform && "lg:translate-y-6"
        )}
      >
        <div className="flex flex-col gap-2 ">
          <h2 className="text-sm font-medium uppercase">{name}</h2>
          {description && (
            <span className="text-sm h-14 line-clamp-3">{description}</span>
          )}
          <div className="flex flex-col">
            <h3 className="font-semibold flex items-center text-3xl mb-1 ">
              {isAnnual && priceAnnual
                ? priceAnnual?.primaryText
                : price.primaryText}{" "}
            </h3>

            {price.secondaryText && (
              <span className="font-normal text-muted-foreground text-sm pb-4 h-10 line-clamp-2">
                {isAnnual && priceAnnual
                  ? priceAnnual?.secondaryText
                  : price.secondaryText}
              </span>
            )}
          </div>
          <div className={cn(" mb-6 ")}>
            <PricingCardButton
              recommended={isRecommended}
              buttonUrl={buttonUrl}
              onClick={onButtonClick}
              {...buttonProps}
            >
              {buttonText}
            </PricingCardButton>
          </div>
        </div>
        {showFeatures && items.length > 0 && (
          <div className="flex-grow">
            <PricingFeatureList
              items={items}
              showIcon={true}
              everythingFrom={everythingFrom}
            />
          </div>
        )}
      </div>
    </div>
  );
};

// Pricing Feature List
export const PricingFeatureList = ({
  items,
  showIcon = true,
  everythingFrom,
  className,
}: {
  items: {
    primaryText: string;
    secondaryText?: string;
  }[];
  showIcon?: boolean;
  everythingFrom?: string;
  className?: string;
}) => {
  return (
    <div className={cn("pb-6 flex-grow", className)}>
      {everythingFrom && (
        <p className="text-sm mb-4">Everything from {everythingFrom}, plus:</p>
      )}
      <div className="space-y-3">
        {items.map((item, index) => (
          <div key={index} className="flex items-start gap-2 text-sm">
            {showIcon && (
              <Check className="h-4 w-4 text-primary flex-shrink-0 mt-0.5" />
            )}
            <div className="flex flex-col">
              <span>{item.primaryText}</span>
              {item.secondaryText && (
                <span className="text-sm text-muted-foreground">
                  {item.secondaryText}
                </span>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};

// Pricing Card Button
export interface PricingCardButtonProps extends React.ComponentProps<"button"> {
  recommended?: boolean;
  buttonUrl?: string;
}

export const PricingCardButton = React.forwardRef<
  HTMLButtonElement,
  PricingCardButtonProps
>(({ recommended, children, buttonUrl, onClick, className, ...props }, ref) => {
  const [loading, setLoading] = useState(false);
  return (
    <Button
      className={cn(
        "w-full py-3 px-4 rounded-md group overflow-hidden relative transition-all duration-300 hover:brightness-90",
        className
      )}
      variant={recommended ? "default" : "secondary"}
      ref={ref}
      disabled={loading}
      onClick={async (e) => {
        if (buttonUrl) {
          window.open(buttonUrl, "_blank");
          return;
        }

        if (onClick) {
          setLoading(true);
          await onClick(e);
          setLoading(false);
        }
      }}
      {...props}
    >
      {loading ? (
        <Loader2 className="h-4 w-4 animate-spin" />
      ) : (
        <>
          {" "}
          <div className="flex items-center justify-between w-full transition-transform duration-300 group-hover:translate-y-[-130%]">
            <span>{children}</span>
            <span className="text-sm">→</span>
          </div>
          <div className="flex items-center justify-between w-full absolute px-4 translate-y-[130%] transition-transform duration-300 group-hover:translate-y-0 mt-2 group-hover:mt-0">
            <span>{children}</span>
            <span className="text-sm">→</span>
          </div>
        </>
      )}
    </Button>
  );
});
PricingCardButton.displayName = "PricingCardButton";

// Annual Switch
export const AnnualSwitch = ({
  isAnnual,
  setIsAnnual,
}: {
  isAnnual: boolean;
  setIsAnnual: (isAnnual: boolean) => void;
}) => {
  return (
    <div className="flex items-center space-x-2 mb-4">
      <span className="text-sm text-muted-foreground">Monthly</span>
      <Switch
        id="annual-billing"
        checked={isAnnual}
        onCheckedChange={setIsAnnual}
      />
      <span className="text-sm text-muted-foreground">Annual</span>
    </div>
  );
};

export const RecommendedBadge = ({ recommended }: { recommended: string }) => {
  return (
    <div className="bg-primary absolute w-fit border text-primary-foreground flex items-center justify-center text-xs uppercase font-medium lg:rounded-full px-3 py-0.5 lg:top-3 lg:right-3 -top-[1px] -right-[1px] rounded-bl-md">
      {recommended}
    </div>
  );
};
