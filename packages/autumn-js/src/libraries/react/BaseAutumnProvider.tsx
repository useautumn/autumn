"use client";

import type React from "react";
import { useEffect, useRef, useState } from "react";
import type { IAutumnClient } from "./client/ReactAutumnClient";
import { useDialog } from "./hooks/helpers/useDialog";
import { useCustomer } from "./hooks/useCustomer";

export function BaseAutumnProvider({
	client,
	children,
	AutumnContext,
}: {
	client: IAutumnClient;
	children: React.ReactNode;
	AutumnContext: any;
}) {
	const [components, setComponents] = useState<{
		paywallDialog?: any;
		productChangeDialog?: any;
	}>({});

	const [paywallProps, setPaywallProps, paywallOpen, setPaywallOpen] =
		useDialog(components.paywallDialog);

	const [
		productChangeProps,
		setProductChangeProps,
		productChangeOpen,
		setProductChangeOpen,
	] = useDialog(components.productChangeDialog);

	// Always prefetch customer, but pass the client directly to avoid context dependency.
	// The hook will work with both HTTP and Convex clients
	useCustomer({ client: client as any, errorOnNotFound: false });

	const paywallRef = useRef<any>(null);

	const [refresh, setRefresh] = useState(0);

	return (
		<AutumnContext.Provider
			value={{
				initialized: true,
				client,
				paywallDialog: {
					props: paywallProps,
					setProps: setPaywallProps,
					open: paywallOpen,
					setOpen: setPaywallOpen,
					setComponent: (component: any) => {
						setComponents({
							...components,
							paywallDialog: component,
						});
					},
				},

				attachDialog: {
					props: productChangeProps,
					setProps: setProductChangeProps,
					open: productChangeOpen,
					setOpen: setProductChangeOpen,
					setComponent: (component: any) => {
						setComponents({
							...components,
							productChangeDialog: component,
						});
					},
				},
				paywallRef,
				refresh,
				setRefresh,
			}}
		>
			{paywallRef.current && (
				<paywallRef.current.component
					open={paywallRef.current.open}
					setOpen={paywallRef.current.setOpen}
					{...paywallRef.current.props}
				/>
			)}
			{components.paywallDialog && (
				<components.paywallDialog
					open={paywallOpen}
					setOpen={setPaywallOpen}
					{...paywallProps}
				/>
			)}
			{components.productChangeDialog && (
				<components.productChangeDialog
					open={productChangeOpen}
					setOpen={setProductChangeOpen}
					{...productChangeProps}
				/>
			)}
			{children}
		</AutumnContext.Provider>
	);
}
