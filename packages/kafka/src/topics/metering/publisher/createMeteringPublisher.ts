import { appendMeteringRecords } from "./appendMeteringRecords.js";
import type {
	MeteringAppend,
	MeteringPublisher,
	MeteringPublisherContext,
} from "./types/meteringPublisher.js";

export function createMeteringPublisher({
	ctx,
}: {
	ctx: MeteringPublisherContext;
}): MeteringPublisher {
	function append(params: MeteringAppend): Promise<{ baseOffset: bigint }> {
		return appendMeteringRecords({ ctx, ...params });
	}

	return { append };
}
