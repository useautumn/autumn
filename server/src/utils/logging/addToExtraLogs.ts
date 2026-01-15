import type { AutumnContext } from "@/honoUtils/HonoEnv";

export const addToExtraLogs = ({
	ctx,
	extras,
}: {
	ctx: AutumnContext;
	extras: Record<string, unknown>;
}) => {
	ctx.extraLogs = {
		...ctx.extraLogs,
		...extras,
	};
};
