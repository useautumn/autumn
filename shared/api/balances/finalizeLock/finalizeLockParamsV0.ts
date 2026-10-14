import { z } from "zod/v4";

export const finalizeLockParamsFields = z.object({
	lock_id: z.string().meta({
		description: "The lock ID that was passed into the previous check call.",
	}),
	action: z.enum(["confirm", "release"]).meta({
		description:
			"Use 'confirm' to commit the deduction, or 'release' to return the held balance.",
	}),
	override_value: z.number().optional().meta({
		description: "Additional properties to attach to this finalize lock event.",
	}),
	properties: z.record(z.string(), z.any()).optional().meta({
		description: "Additional properties to attach to this finalize lock event.",
	}),
});

/** A release gives everything back, so it takes no value to settle at. */
export const releaseTakesNoOverrideValue = (data: {
	action: "confirm" | "release";
	override_value?: number;
}) => !(data.action === "release" && data.override_value !== undefined);

export const releaseTakesNoOverrideValueError = {
	message: "override_value cannot be provided when action is release",
	path: ["override_value"],
};

export const FinalizeLockParamsV0Schema = finalizeLockParamsFields.refine(
	releaseTakesNoOverrideValue,
	releaseTakesNoOverrideValueError,
);

export type FinalizeLockParamsV0 = z.infer<typeof FinalizeLockParamsV0Schema>;
