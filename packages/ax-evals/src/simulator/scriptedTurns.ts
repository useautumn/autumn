import type { TurnSource } from "./types/turnSource.ts";

export const scriptedTurns = (turns: string[]): TurnSource => {
	let index = 0;
	return {
		maxUserTurns: turns.length,
		next: () => (index < turns.length ? turns[index++] : null),
	};
};
