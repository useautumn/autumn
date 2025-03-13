import { createContext, useContext } from "react";

export const DevContext = createContext<any>(null);

export const useDevContext = () => {
  const context = useContext(DevContext);

  if (context === undefined) {
    throw new Error("useDevContext must be used within a DevContextProvider");
  }

  return context;
};
