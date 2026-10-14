import type { AutumnContext } from "../../../../../honoUtils/HonoEnv";

export type PrepareModule<Input, Result, Kind extends string = string> = {
	kind: Kind;

	plan: (args: {
		ctx: AutumnContext;
		scopeId: string;
		input: Input;
	}) => Promise<Result>;

	apply: (args: {
		ctx: AutumnContext;
		scopeId: string;
		input: Input;
		planned: Result;
	}) => Promise<Result>;
};
