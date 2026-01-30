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

const useSecretKey = () => useSecretKeyStore((s) => s.secretKey);
const useSetSecretKey = () => useSecretKeyStore((s) => s.setSecretKey);
