import { constructProduct } from "@/internal/products/productUtils.js";
import { generateId } from "@/utils/genUtils.js";
import { Feature, Product, ProductV2 } from "@autumn/shared";

export const parseChatProducts = ({
  features,
  chatProducts,
}: {
  features: Feature[];
  chatProducts: ProductV2[];
}) => {
  let products: ProductV2[] = [];

  for (const product of chatProducts) {
    let backendPro: Product = constructProduct({
      productData: {
        id: product.id,
        name: product.name,
        is_add_on: product.is_add_on,
        is_default: product.is_default,
      },
      orgId: orgId,
      env: env,
    });
    products.push();
  }
};
