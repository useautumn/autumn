declare module "@tw/image/nuke-accounts.mjs" {
	export const nukeAccountContents: (args: {
		accountId: string;
		key: string;
	}) => Promise<{ counts: Record<string, number>; ms: number }>;
	export const setPoolState: (args: {
		accountId: string;
		key: string;
		state: "clean" | "dirty" | "nuking";
		extra?: Record<string, string>;
	}) => Promise<void>;
	export const markNuking: (args: {
		accountId: string;
		key: string;
	}) => Promise<void>;
}
