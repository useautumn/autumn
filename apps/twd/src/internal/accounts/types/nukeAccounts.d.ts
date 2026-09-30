declare module "@tw/image/nuke-accounts.mjs" {
	export const nukeAccountContents: (args: {
		accountId: string;
		key: string;
	}) => Promise<{ counts: Record<string, number>; ms: number }>;
}
