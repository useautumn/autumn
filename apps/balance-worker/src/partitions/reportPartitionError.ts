import type { PartitionsContext } from "./types/partitionState.js";

export function reportPartitionError({
	ctx,
	cause,
}: {
	ctx: PartitionsContext;
	cause: unknown;
}): void {
	try {
		ctx.onError({ cause });
	} catch {
		return;
	}
}
