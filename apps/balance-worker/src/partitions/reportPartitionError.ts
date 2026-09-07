import type { PartitionsDependencies } from "./types/partitions.js";
export function reportPartitionError({
	ctx,
	cause,
}: {
	ctx: Pick<PartitionsDependencies, "onError">;
	cause: unknown;
}): void {
	try {
		ctx.onError({ cause });
	} catch {
		return;
	}
}
