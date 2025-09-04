import { FullCusProduct, FullCustomer, notNullish } from "@autumn/shared";

export const getCusProductMinQuantity = ({
  customer,
  productId,
}: {
  customer: FullCustomer;
  productId: string;
}) => {
  const cusProducts = customer.customer_products;
  const entityCount = cusProducts.filter(
    (cusProduct) =>
      cusProduct.product_id === productId &&
      notNullish(cusProduct.internal_entity_id)
  ).length;
  return entityCount || 1;
};
