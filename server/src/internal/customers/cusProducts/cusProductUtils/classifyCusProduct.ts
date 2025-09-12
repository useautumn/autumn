import { FullCusProduct } from "@autumn/shared";

export const isCanceled = ({ cusProduct }: { cusProduct: FullCusProduct }) => {
  return cusProduct.canceled_at !== null && cusProduct.canceled_at !== undefined;
};
