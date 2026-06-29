import { NEON_PARENT_BRANCH, NEON_PROJECT_ID } from "../constants.ts";

export type NeonProjectContext = {
	projectId: string;
	templateParent: string;
};

let override: NeonProjectContext | undefined;

export function neonProjectId(): string {
	return override?.projectId ?? NEON_PROJECT_ID;
}

export function neonTemplateParent(): string {
	return override?.templateParent ?? NEON_PARENT_BRANCH;
}

export function withNeonContextSync<T>(
	ctx: NeonProjectContext | undefined,
	fn: () => T,
): T {
	if (!ctx || ctx.projectId === NEON_PROJECT_ID) return fn();
	const prev = override;
	override = ctx;
	try {
		return fn();
	} finally {
		override = prev;
	}
}

export async function withNeonContext<T>(
	ctx: NeonProjectContext | undefined,
	fn: () => T | Promise<T>,
): Promise<T> {
	if (!ctx || ctx.projectId === NEON_PROJECT_ID) return await fn();
	const prev = override;
	override = ctx;
	try {
		return await fn();
	} finally {
		override = prev;
	}
}
