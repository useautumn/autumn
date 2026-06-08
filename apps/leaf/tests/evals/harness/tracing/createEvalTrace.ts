import { formatTraceEvent } from "./formatTrace.js";
import type { EvalTrace, EvalTraceEvent, EvalTraceLevel } from "./types.js";

export const createEvalTrace = ({
	level = "steps",
}: {
	level?: EvalTraceLevel;
} = {}): EvalTrace => {
	const events: EvalTraceEvent[] = [];
	const printEvent = (event: EvalTraceEvent) => {
		if (level === "off") return;
		const line = formatTraceEvent(event);
		if (line) console.error(line);
	};

	return {
		entries: () => [...events],
		event: (event) => {
			events.push(event);
			printEvent(event);
		},
		print: () => {
			for (const event of events) printEvent(event);
		},
	};
};
