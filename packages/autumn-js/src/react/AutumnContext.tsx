import { createContext, useContext } from "react";
import type { IAutumnClient } from "./client/IAutumnClient";

export type AutumnContextValue = {
	client: IAutumnClient;
};

export const AutumnContext = createContext<AutumnContextValue | null>(null);

export const useAutumnClient = ({
	caller,
}: {
	caller: string;
}): IAutumnClient => {
	const context = useContext(AutumnContext);
	if (!context) {
		throw new Error(`${caller} must be used within <AutumnProvider/>`);
	}
	return context.client;
};
