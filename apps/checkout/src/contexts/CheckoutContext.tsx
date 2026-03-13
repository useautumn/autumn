import type { ReactNode } from "react";
import { createContext, useContext } from "react";
import { type CheckoutState, useCheckoutState } from "@/hooks/useCheckoutState";
import type { CheckoutRouteMode } from "@/utils/checkoutRouteMode";

const CheckoutContext = createContext<CheckoutState | null>(null);

export function CheckoutProvider({
	checkoutId,
	routeMode,
	children,
}: {
	checkoutId: string;
	routeMode: CheckoutRouteMode;
	children: ReactNode;
}) {
	const state = useCheckoutState({
		checkoutId,
		routeMode,
	});
	return (
		<CheckoutContext.Provider value={state}>
			{children}
		</CheckoutContext.Provider>
	);
}

export function useCheckoutContext() {
	const ctx = useContext(CheckoutContext);
	if (!ctx) {
		throw new Error("useCheckoutContext must be used within CheckoutProvider");
	}
	return ctx;
}
