import { createContext, useContext } from "react";

export const ProductItemContext = createContext<any>(null);

export const useProductItemContext = () => {
  const context = useContext(ProductItemContext);

  if (context === undefined) {
    throw new Error(
      "useProductItemContext must be used within a ProductItemContextProvider"
    );
  }

  return context;
};
