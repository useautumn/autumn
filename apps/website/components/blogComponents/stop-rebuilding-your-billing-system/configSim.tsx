"use client";

import { createContext, type ReactNode, useContext } from "react";
import { type ChangeId, TogglePill, useApplied } from "./shared";

type ConfigSimValue = ReturnType<typeof useApplied>;

const ConfigSimContext = createContext<ConfigSimValue | null>(null);

export function ConfigSim({ children }: { children: ReactNode }) {
	const value = useApplied();
	return (
		<ConfigSimContext.Provider value={value}>
			{children}
		</ConfigSimContext.Provider>
	);
}

export function useConfigSim() {
	const ctx = useContext(ConfigSimContext);
	if (!ctx) {
		throw new Error("useConfigSim must be used within <ConfigSim>");
	}
	return ctx;
}

export function Toggle({
	change,
	children,
}: {
	change: ChangeId;
	children: ReactNode;
}) {
	const { applied, toggle } = useConfigSim();
	return (
		<TogglePill active={applied.has(change)} onClick={() => toggle(change)}>
			{children}
		</TogglePill>
	);
}
