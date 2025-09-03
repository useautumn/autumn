import { FullCusProduct } from "../../models/cusProductModels/cusProductModels.js";

export const isCanceled = ({ cusProduct }: { cusProduct: FullCusProduct }) => {
  return cusProduct.canceled;
};

export const isTrialing = ({
  cusProduct,
  now,
}: {
  cusProduct: FullCusProduct;
  now?: number;
}) => {
  return (
    cusProduct.trial_ends_at && cusProduct.trial_ends_at > (now || Date.now())
  );
};
