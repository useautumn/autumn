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

export const appendToExtraLogs = ({
	ctx,
	key,
	value,
}: {
	ctx: AutumnContext;
	key: string;
	value: unknown;
}) => {
	const existing = ctx.extraLogs?.[key];
	const array = Array.isArray(existing) ? existing : [];

	ctx.extraLogs = {
		...ctx.extraLogs,
		[key]: [...array, value],
	};
};
