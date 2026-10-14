import type { AxRunOutput } from "../../types/axRunOutput.ts";
import type { AxScore } from "./axScore.ts";

export type Expectation = {
	name: string;
	kind: "config" | "conduct" | "flow";
	score: (output: AxRunOutput) => AxScore | Promise<AxScore>;
};
