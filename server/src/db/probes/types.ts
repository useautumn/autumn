import type { DrizzleCli } from "../initDrizzle.js";

export type DbProbe = {
	name: string;
	run: (args: { db: DrizzleCli }) => Promise<void>;
};
