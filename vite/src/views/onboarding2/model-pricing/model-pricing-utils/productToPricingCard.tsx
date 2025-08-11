export const productToPricingCard = (product: any) => {
  return {
    id: product.id,
    name: product.name,
    items: product.items,
  };
};
