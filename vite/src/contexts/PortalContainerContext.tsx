import { createContext, type RefObject, useContext } from "react";

export const PortalContainerContext =
	createContext<RefObject<HTMLDivElement | null> | null>(null);

export const usePortalContainer = () => useContext(PortalContainerContext);
