import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { Separator } from "@/components/ui/separator";
import { useProductContext } from "./ProductContext";
import { ToggleDisplayButton } from "@/components/general/ToggleDisplayButton";
import { Gift } from "lucide-react";

export default function ProductSidebar({
  showFreeTrial,
  setShowFreeTrial,
}: {
  showFreeTrial: boolean;
  setShowFreeTrial: (showFreeTrial: boolean) => void;
}) {
  const { product, org } = useProductContext();

  const getPriceDisplay = (price: any) => {
    const currency = org?.default_currency || "USD";
    if (price.config.type === "fixed") {
      const formattedAmount = new Intl.NumberFormat("en-US", {
        style: "currency",
        currency: currency,
      }).format(price.config.amount);

      return `${formattedAmount}/${price.config.interval}`;
    } else if (price.config.type === "usage") {
      const formatUsageAmount = (amount: number) => {
        return new Intl.NumberFormat("en-US", {
          style: "currency",
          currency: currency,
          minimumFractionDigits: 0,
          maximumFractionDigits: 10,
        }).format(amount);
      };

      const amounts = price.config.usage_tiers.map((tier: any) => tier.amount);
      if (amounts.length > 1) {
        const minAmount = formatUsageAmount(Math.min(...amounts));
        const maxAmount = formatUsageAmount(Math.max(...amounts));
        return `${minAmount} - ${maxAmount} per unit`;
      }
      return `${formatUsageAmount(amounts[0])} per unit`;
    }
    return "N/A";
  };

  return (
    <div className="flex flex-col gap-4 h-full ml-2">
      <ToggleDisplayButton
        show={showFreeTrial}
        onClick={() => setShowFreeTrial(!showFreeTrial)}
        disabled={product.free_trial}
      >
        <Gift size={14} />
        Free trial
      </ToggleDisplayButton>
      <Accordion
        type="multiple"
        defaultValue={[""]}
        className="w-full flex flex-col gap-4"
      >
        <div className="pl-4">
          <AccordionItem
            value="entitlements"
            className="data-[state=open]:bg-white data-[state=open]:border-zinc-200 border border-transparent transition-all duration-100 ease-out origin-top"
          >
            <div className="w-fit">
              <AccordionTrigger className="data-[state=closed]:hover:bg-white data-[state=closed]:hover:border-zinc-200 border border-transparent text-t2 p-2">
                <span>Included Features</span>
              </AccordionTrigger>
            </div>
            <AccordionContent>
              <div className="flex flex-col gap-2 p-2 px-4">
                <div className="flex items-center justify-between">
                  <span>Status</span>
                  <span className="text-muted-foreground">Active</span>
                </div>
                <div className="flex items-center justify-between">
                  <span>Type</span>
                  <span className="text-muted-foreground">Standard</span>
                </div>
                {/* Add more entitlement fields as needed */}
              </div>
            </AccordionContent>
          </AccordionItem>
        </div>

        <div className="pl-4">
          {/* <AccordionItem
            value="pricing"
            className="data-[state=open]:bg-white data-[state=open]:border-zinc-200 border border-transparent transition-all duration-100 ease-out origin-top"
          >
            <div className="w-fit">
              <AccordionTrigger className="data-[state=closed]:hover:bg-white data-[state=closed]:hover:border-zinc-200 border border-transparent text-t2 p-2">
                <span>Prices </span>
              </AccordionTrigger>
            </div>
            <AccordionContent>
              <div className="flex flex-col gap-2 p-2">
                {product.prices.map((price: any, index: number) => (
                  <div key={index} className="flex flex-col gap-1">
                    <div className="flex items-center justify-between">
                      <span>{price.name}</span>
                      <span className="text-muted-foreground">
                        {getPriceDisplay(price)}
                      </span>
                    </div>
                    <span className="text-xs text-muted-foreground">
                      {price.config.type.charAt(0).toUpperCase() +
                        price.config.type.slice(1)}
                    </span>
                  </div>
                ))}
                {product.prices.length === 0 && (
                  <span className="text-muted-foreground">
                    No pricing configured
                  </span>
                )}
              </div>
            </AccordionContent>
          </AccordionItem> */}
        </div>
      </Accordion>
    </div>
  );
}
