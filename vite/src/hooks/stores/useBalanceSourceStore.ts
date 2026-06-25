import { create } from "zustand";

/**
 * Which balance values the customer page shows. "live" reads the up-to-date
 * Redis balances (default); "db" reads the persisted Postgres values, which lag
 * behind because the balance sync is async. Admin-only toggle.
 */
export type BalanceSource = "live" | "db";

type BalanceSourceStore = {
	source: BalanceSource;
	setSource: (source: BalanceSource) => void;
	toggle: () => void;
};

export const useBalanceSourceStore = create<BalanceSourceStore>((set) => ({
	source: "live",
	setSource: (source) => set({ source }),
	toggle: () =>
		set((state) => ({ source: state.source === "live" ? "db" : "live" })),
}));
