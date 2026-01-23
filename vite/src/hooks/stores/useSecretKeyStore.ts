import { create } from "zustand";

interface SecretKeyState {
	secretKey: string;
	setSecretKey: (key: string) => void;
	clearSecretKey: () => void;
}

export const useSecretKeyStore = create<SecretKeyState>()((set) => ({
	secretKey: "",
	setSecretKey: (key) => set({ secretKey: key }),
	clearSecretKey: () => set({ secretKey: "" }),
}));

export const useSecretKey = () => useSecretKeyStore((s) => s.secretKey);
export const useSetSecretKey = () => useSecretKeyStore((s) => s.setSecretKey);
