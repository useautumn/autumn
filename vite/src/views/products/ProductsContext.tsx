import { createContext, useContext } from "react";

export const ProductsContext = createContext<any>(null);

export const useProductsContext = () => {
  const context = useContext(ProductsContext);

  if (context === undefined) {
    throw new Error(
      "useProductsContext must be used within a ProductsContextProvider"
    );
  }

  return context;
};
