import { sendOwnerFence } from "../../../producer/sendOwnerFence.js";
import { appendMeteringRecords } from "./appendMeteringRecords.js";
import type {
	MeteringAppend,
	MeteringFence,
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

	async function fence({
		topic,
		partition,
		ownerEpoch,
	}: MeteringFence): Promise<{ offset: bigint } | null> {
		if (ctx.commit?.mode !== "idempotent") return null;
		if (!ctx.producer.send)
			throw new Error("Idempotent commits need a producer with a plain send");
		return sendOwnerFence({
			sender: { send: ctx.producer.send },
			topic,
			partition,
			ownerEpoch,
		});
	}
	return { append, fence };
}
