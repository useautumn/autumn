import { CommandContext, StricliProcess } from "@stricli/core";

export interface LocalContext extends CommandContext {
	readonly process: StricliProcess;
}

export function buildContext(process: NodeJS.Process): LocalContext {
	return { process: process as StricliProcess };
}
