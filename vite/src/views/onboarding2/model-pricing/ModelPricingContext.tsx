import { createContext, useContext } from "react";

export const ModelPricingContext = createContext<any>(null);

export const useModelPricingContext = () => {
  const context = useContext(ModelPricingContext);

  return context;
};
