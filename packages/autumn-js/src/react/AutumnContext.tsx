import { createContext, useContext } from "react";
import type { IAutumnClient } from "./client/IAutumnClient";

export type AutumnContextValue = {
	client: IAutumnClient;
};

export const AutumnContext = createContext<AutumnContextValue | null>(null);

export const useAutumnClient = (): IAutumnClient => {
	const context = useContext(AutumnContext);
	if (!context) {
		throw new Error("useAutumnClient must be used within an AutumnProvider");
	}
	return context.client;
};
