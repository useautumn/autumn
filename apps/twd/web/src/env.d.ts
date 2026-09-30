/// <reference types="vite/client" />

interface ImportMetaEnv {
	readonly VITE_TWD_URL?: string;
	readonly VITE_TWD_MOCK?: string;
	readonly VITE_TWD_API_BASE?: string;
}

interface ImportMeta {
	readonly env: ImportMetaEnv;
}
