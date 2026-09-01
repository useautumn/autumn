import type { Topic } from "../../simulator/topicWords.ts";
import type { AxRunOutput } from "../../types/axRunOutput.ts";
import type { Expectation } from "../types/expectation.ts";

const firstAskedIndex = (output: AxRunOutput, topic: Topic): number =>
	output.askedAbout.findIndex((asked) => asked.topic === topic);

export const flow = {
	/** the agent's questions hit this topic at least once */
	covered: (topic: Topic): Expectation => ({
		name: `asked about ${topic}`,
		kind: "flow",
		score: (output) => ({
			name: `asked about ${topic}`,
			score: firstAskedIndex(output, topic) >= 0 ? 1 : 0,
			metadata: { askedAbout: output.askedAbout },
		}),
	}),

	/** first hit of each topic follows the given order. Tracked as signal —
	 * treat as a gate only once the skill under test prescribes the order. */
	inOrder: (topicsInOrder: Topic[]): Expectation => {
		const name = `asked in order: ${topicsInOrder.join(" → ")}`;
		return {
			name,
			kind: "flow",
			score: (output) => {
				const askedIndices = topicsInOrder.map((topic) =>
					firstAskedIndex(output, topic),
				);
				const ordered = askedIndices.every(
					(askedIndex, position) =>
						askedIndex >= 0 &&
						(position === 0 || askedIndex > (askedIndices[position - 1] ?? -1)),
				);
				return {
					name,
					score: ordered ? 1 : 0,
					metadata: { askedAbout: output.askedAbout },
				};
			},
		};
	},
};
