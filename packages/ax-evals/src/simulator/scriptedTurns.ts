import type { TurnSource } from "./types/turnSource.ts";

/** Fixed script: turns are sent in order regardless of what the agent says. */
export const scriptedTurns = (turns: string[]): TurnSource => {
	let index = 0;
	return {
		maxUserTurns: turns.length,
		next: () => (index < turns.length ? turns[index++] : null),
	};
};
