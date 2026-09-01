import type { AxRunOutput } from "../../types/axRunOutput.ts";
import type { AxScore } from "./axScore.ts";

/**
 * One declared expectation derives one named Braintrust scorer. Cases read as
 * `expect: [config.valid(), config.plan(...)]`.
 */
export type Expectation = {
	name: string;
	/** config = graded from the produced config; conduct = graded from behavior;
	 * flow = graded from the simulator's interview trace */
	kind: "config" | "conduct" | "flow";
	/** async when the scorer calls out (e.g. an LLM judge) */
	score: (output: AxRunOutput) => AxScore | Promise<AxScore>;
};
