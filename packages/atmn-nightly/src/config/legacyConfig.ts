import { basename } from "node:path";

/** The 1.x package exported an `item` builder; 2.x never did. */
const LEGACY_IMPORT =
	/import\s*\{[^}]*\bitem\b[^}]*\}\s*from\s*["']atmn(?:-nightly)?["']/;
const DEFAULT_EXPORT = /^\s*export\s+default\b/m;

/** A config written for atmn 1.x: it imports `item`, or has no root export. */
export const isLegacyConfigText = ({ text }: { text: string }): boolean =>
	LEGACY_IMPORT.test(text) || !DEFAULT_EXPORT.test(text);

export class LegacyConfigError extends Error {
	constructor({ path }: { path: string }) {
		super(
			[
				`${basename(path)} was written for atmn 1.x. atmn 2 uses a new config format.`,
				"",
				"  1. Push any pending changes first:   bunx atmn@1 push",
				"  2. Rebuild the config from your org:  bunx atmn pull --overwrite --yes",
				"     (this rewrites autumn.config.ts, features.ts, plans.ts and rewards.ts, so commit them first)",
			].join("\n"),
		);
		this.name = "LegacyConfigError";
	}
}
