import useLocalStorage from "@/hooks/useLocalStorage";
import { createContext, useContext } from "react";

export const SidebarContext = createContext<any>(null);

export const useSidebarContext = () => {
  const context = useContext(SidebarContext);

  if (context === undefined) {
    throw new Error(
      "useSidebarContext must be used within a SidebarContextProvider"
    );
  }

  return context;
};
