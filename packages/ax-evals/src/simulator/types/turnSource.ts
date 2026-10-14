export type TurnSource = {
	next: (lastAgentText: string) => string | null | Promise<string | null>;
	maxUserTurns: number;
};
