/** `bun test --preload ./tests/preload/leanEngineDiet.ts`: the whole suite on the lean track paths. */
import { bindEngineDiet } from "../../src/utils/engineDiet/engineDiet.js";

bindEngineDiet({
	read: () =>
		Object.freeze({
			rowChanges: true,
			requestOnce: true,
			advanceContext: true,
		}),
});
