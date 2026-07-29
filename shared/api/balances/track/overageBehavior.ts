import { z } from "zod/v4";

// "reject" stays accepted but internal: the branch is stripped from the
// public OpenAPI spec, so docs/SDKs only surface "cap" and "overflow".
export const OverageBehaviorSchema = z
	.union([
		z.enum(["cap", "overflow"]),
		z.enum(["reject"]).meta({ internal: true }),
	])
	.meta({
		description:
			'How to handle usage that exceeds the available balance. "cap" (default) deducts only what fits, stopping at zero. "overflow" deducts the full value: the balance can go negative and usage limits do not clamp the deduction, though spend limits still apply.',
	});
