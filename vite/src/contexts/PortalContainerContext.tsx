import { createContext, type RefObject, useContext } from "react";

export const PortalContainerContext =
	createContext<RefObject<HTMLDivElement | null> | null>(null);

const usePortalContainer = () => useContext(PortalContainerContext);
