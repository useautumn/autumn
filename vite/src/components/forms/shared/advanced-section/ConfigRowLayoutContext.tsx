import { createContext, type ReactNode, useContext } from "react";

export type ConfigRowLayout = "plain" | "tray";

const ConfigRowLayoutContext = createContext<ConfigRowLayout>("plain");

export function ConfigRowLayoutProvider({
	layout,
	children,
}: {
	layout: ConfigRowLayout;
	children: ReactNode;
}) {
	return (
		<ConfigRowLayoutContext.Provider value={layout}>
			{children}
		</ConfigRowLayoutContext.Provider>
	);
}

export const useConfigRowLayout = () => useContext(ConfigRowLayoutContext);
