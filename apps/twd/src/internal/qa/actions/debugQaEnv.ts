import type { TwdContext } from "../../../lib/types/twdContext.ts";
import { requireQaEnvRow } from "../repos/qaEnvsRepo.ts";
import { qaWorker } from "../worker/qaWorkerClient.ts";

export const QA_SERVICES = [
	"boot",
	"server",
	"workers",
	"cron",
	"balance-worker",
	"kafka",
	"dragonfly",
	"fakecloud",
	"proxy",
] as const;

/** Each wakes the env if it is asleep; the env must exist in twd. */
export const getQaEnvLogs = async ({
	ctx,
	name,
	service,
	lines,
}: {
	ctx: TwdContext;
	name: string;
	service: (typeof QA_SERVICES)[number];
	lines: number;
}) => {
	await requireQaEnvRow({ ctx, name });
	return qaWorker.logs({ ctx, name, service, lines });
};

export const execInQaEnv = async ({
	ctx,
	name,
	command,
}: {
	ctx: TwdContext;
	name: string;
	command: string;
}) => {
	await requireQaEnvRow({ ctx, name });
	ctx.logger.info("qa exec", {
		name,
		by: ctx.actor?.email,
		command: command.slice(0, 500),
	});
	return qaWorker.exec({ ctx, name, command });
};

export const restartQaEnv = async ({
	ctx,
	name,
}: {
	ctx: TwdContext;
	name: string;
}) => {
	await requireQaEnvRow({ ctx, name });
	return qaWorker.restart({ ctx, name });
};
