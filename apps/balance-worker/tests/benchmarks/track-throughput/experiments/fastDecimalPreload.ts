import { plugin } from "bun";

// Draft experiment: resolve every decimal.js import to the number-backed stand-in.
plugin({
	name: "fast-decimal",
	setup(build) {
		build.onResolve({ filter: /^decimal\.js$/ }, () => ({
			path: `${import.meta.dir}/fastDecimal.ts`,
		}));
	},
});
