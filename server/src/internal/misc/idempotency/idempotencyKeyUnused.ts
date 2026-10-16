import type { AutumnContext } from "@/honoUtils/HonoEnv.js";

const IDEMPOTENCY_KEY_UNUSED_KEY = "idempotencyKeyUnused";

/** The request answered without writing or submitting anything, so its idempotency key is freed for the write that did. */
export const markIdempotencyKeyUnused = ({
	ctx,
}: {
	ctx: AutumnContext;
}): void => {
	ctx.state[IDEMPOTENCY_KEY_UNUSED_KEY] = true;
};

export const isIdempotencyKeyUnused = ({
	ctx,
}: {
	ctx: AutumnContext;
}): boolean => ctx.state?.[IDEMPOTENCY_KEY_UNUSED_KEY] === true;
