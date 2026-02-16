import { createContext, useContext } from "react";
import { AutumnClient } from "./client/ReactAutumnClient";

export interface AutumnDialogContext {
	props: any;
	setProps: (props: any) => void;
	open: boolean;
	setOpen: (open: boolean) => void;
	setComponent: (component: any) => void;
}

export interface AutumnContextParams {
	initialized: boolean;
	disableDialogs: boolean;

	client: AutumnClient;

	// Internal
	paywallDialog: AutumnDialogContext;
	attachDialog: AutumnDialogContext;
	paywallRef: React.RefObject<any>;
}

export const AutumnContext = createContext<AutumnContextParams>({
	initialized: false,
	disableDialogs: false,

	client: new AutumnClient({ backendUrl: "" }),

	paywallDialog: {
		props: null,
		setProps: () => {},
		open: false,
		setOpen: () => {},
		setComponent: () => {},
	},

	attachDialog: {
		props: null,
		setProps: () => {},
		open: false,
		setOpen: () => {},
		setComponent: () => {},
	},

	paywallRef: { current: null },
});

export const useAutumnContext = ({
	AutumnContext: customAutumnContext,
	name,
	errorIfNotInitialized = true,
}: {
	AutumnContext?: React.Context<AutumnContextParams>;
	name: string;
	errorIfNotInitialized?: boolean;
}) => {
	const context = useContext(customAutumnContext ?? AutumnContext);

	if (!context.initialized && errorIfNotInitialized) {
		throw new Error(`${name} must be used within <AutumnProvider />`);
	}

	return context;
};
