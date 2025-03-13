import { createContext, useContext } from "react";

export const FeaturesContext = createContext<any>(null);

export const useFeaturesContext = () => {
  const context = useContext(FeaturesContext);

  if (context === undefined) {
    throw new Error(
      "useFeaturesContext must be used within a FeaturesContextProvider"
    );
  }

  return context;
};
