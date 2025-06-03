import {
  PriceItem,
  QuantityInput,
} from "@/components/pricing/attach-pricing-dialog";
import { formatUnixToDate } from "@/utils/formatUtils/formatDateUtils";
import { formatAmount } from "@/utils/formatUtils/formatTextUtils";
import { useProductContext } from "@/views/products/product/ProductContext";
import { Feature, getFeatureInvoiceDescription } from "@autumn/shared";
import { Separator } from "@/components/ui/separator";
import React from "react";
import { AttachNewItems } from "./attach-preview/AttachNewItems";
import { DueToday } from "./attach-preview/DueToday";
import { DueNextCycle } from "./attach-preview/DueNextCycle";

export const AttachPreviewDetails = () => {
  const { product, features, org, attachState } = useProductContext();
  const { preview, options, setOptions } = attachState;

  const currency = org.default_currency || "USD";

  const dueTodayItems = preview?.due_today?.line_items || [];

  if (!preview) {
    return null;
  }

  return (
    <React.Fragment>
      <DueToday />
      <AttachNewItems />
      <DueNextCycle />
    </React.Fragment>
  );
};
