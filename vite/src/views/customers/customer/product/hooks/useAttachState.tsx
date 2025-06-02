import { isOneOffProduct } from "@/utils/product/priceUtils";
import {
  AttachScenario,
  CheckProductPreview,
  FeatureOptions,
  ProductV2,
} from "@autumn/shared";
import { useEffect, useRef, useState } from "react";

type FrontendProduct = ProductV2 & {
  isActive: boolean;
  options: FeatureOptions[];
};

export enum AttachCase {
  AddOn = "Add On",
  OneOff = "One Off",
  Active = "Active",
  Custom = "Custom",
  Checkout = "Checkout",
}

export const useAttachState = ({
  product,
  preview,
}: {
  product: FrontendProduct | null;
  preview?: CheckProductPreview | null;
}) => {
  const initialProductRef = useRef<FrontendProduct | null>(null);

  const [itemsChanged, setItemsChanged] = useState(false);

  useEffect(() => {
    if (!product) {
      return;
    }

    if (!initialProductRef.current) {
      initialProductRef.current = structuredClone(product);
      setItemsChanged(false);
      return;
    }

    const hasItemsChanged =
      JSON.stringify(product.items) !==
      JSON.stringify(initialProductRef.current.items);

    setItemsChanged(hasItemsChanged);
  }, [product]);

  const buttonDisabled = product?.isActive && !itemsChanged;

  const getAttachCase = () => {
    if (!product) {
      return null;
    }

    if (product?.is_add_on) {
      return AttachCase.AddOn;
    }

    if (isOneOffProduct(product.items, product.is_add_on)) {
      return AttachCase.OneOff;
    }

    if (product?.isActive && !itemsChanged) {
      return AttachCase.Active;
    }

    if (itemsChanged) {
      return AttachCase.Custom;
    }

    if (!preview || !preview.payment_method) {
      return AttachCase.Checkout;
    }

    return preview.scenario;
  };

  const getButtonText = () => {
    const attachCase = getAttachCase();

    switch (attachCase) {
      case AttachCase.Custom:
        return `Attach Custom Version`;
      default:
        return "Attach Product";
    }
  };

  return {
    itemsChanged,
    buttonDisabled,
    buttonText: getButtonText(),
    attachCase: getAttachCase(),
  };
};
