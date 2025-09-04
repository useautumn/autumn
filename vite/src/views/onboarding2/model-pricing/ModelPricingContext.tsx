import { createContext, useContext } from "react";

export const ModelPricingContext = createContext<any>(null);

export const useModelPricingContext = () => {
  const context = useContext(ModelPricingContext);

  // if (context === undefined) {
  //   throw new Error(
  //     "useProductContext must be used within a ProductContextProvider"
  //   );
  // }

  return context;
};
