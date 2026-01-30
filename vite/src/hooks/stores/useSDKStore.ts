import { create } from "zustand";
import { persist } from "zustand/middleware";

export type SDKType = "react" | "node" | "python" | "curl";

interface SDKState {
	selectedSDK: SDKType;
	setSelectedSDK: (sdk: SDKType) => void;
}

export const useSDKStore = create<SDKState>()(
	persist(
		(set) => ({
			selectedSDK: "react",
			setSelectedSDK: (sdk) => set({ selectedSDK: sdk }),
		}),
		{
			name: "autumn-sdk-preference",
		},
	),
);

const useSelectedSDK = () => useSDKStore((s) => s.selectedSDK);
const useSetSelectedSDK = () => useSDKStore((s) => s.setSelectedSDK);
