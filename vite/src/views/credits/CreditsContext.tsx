import { createContext, useContext } from "react";

export const CreditsContext = createContext<any>(null);

export const useCreditsContext = () => {
  const context = useContext(CreditsContext);

  if (context === undefined) {
    throw new Error(
      "useCreditsContext must be used within a CreditsContextProvider"
    );
  }

  return context;
};
