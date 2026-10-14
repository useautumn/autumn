import { z } from "zod/v4";

/** Display text whose date parts the client formats in its own timezone. */
export const SetPlansReviewTextSchema = z.array(
	z.union([z.string(), z.object({ date: z.number() })]),
);

export const SetPlansReviewChangeLineSchema = z.object({
	state: z.enum(["new", "updated", "removed"]),
	label: z.string(),
	before: SetPlansReviewTextSchema.optional(),
	after: SetPlansReviewTextSchema.optional(),
});

export const SetPlansReviewValueSchema = z.object({
	amount: z.string(),
	suffix: z.string().optional(),
	/** A billing basis like "Usage-based" rather than a charge. */
	is_basis: z.boolean().optional(),
});

export const SetPlansReviewRowSchema = z.object({
	key: z.string(),
	title: z.string(),
	description: SetPlansReviewTextSchema.optional(),
	status: z
		.enum([
			"starts",
			"ends",
			"kept",
			"updated",
			"added",
			"removed",
			"reset",
			"carried",
		])
		.optional(),
	/** What changed on an updated row. */
	changes: z.array(SetPlansReviewChangeLineSchema).optional(),
	trial_ends_at: z.number().optional(),
	/** Kept across every phase, so a later schedule change won't end it. */
	ongoing: z.boolean().optional(),
	pooled: z
		.object({
			previous_total: z.number().nullable(),
			total: z.number(),
			contributors: z.number(),
		})
		.optional(),
	value: SetPlansReviewValueSchema.optional(),
	quantity: z.string().optional(),
	/** The row's scope: null when customer-level, absent on rows that have no scope. */
	entity_id: z.string().nullable().optional(),
});

export const SetPlansReviewPhaseSchema = z.object({
	key: z.string(),
	label: SetPlansReviewTextSchema,
	range: SetPlansReviewTextSchema.optional(),
	badge: z.enum(["active", "scheduled", "canceled"]).optional(),
	/** A saved future phase the request drops. */
	removed: z.boolean().optional(),
	rows: z.array(SetPlansReviewRowSchema),
});

export const SetPlansReviewSectionSchema = z.object({
	phases: z.array(SetPlansReviewPhaseSchema),
	summary: SetPlansReviewTextSchema,
	stripe_ids: z
		.array(z.object({ key: z.string(), label: z.string(), id: z.string() }))
		.optional(),
});

/** The preview as the dashboard shows it: plan, balance and subscription changes per phase. */
export const SetPlansPreviewReviewSchema = z.object({
	plans: SetPlansReviewSectionSchema,
	balances: SetPlansReviewSectionSchema,
	subscription: SetPlansReviewSectionSchema,
});

export type SetPlansReviewText = z.infer<typeof SetPlansReviewTextSchema>;
export type SetPlansReviewChangeLine = z.infer<
	typeof SetPlansReviewChangeLineSchema
>;
export type SetPlansReviewValue = z.infer<typeof SetPlansReviewValueSchema>;
export type SetPlansReviewRow = z.infer<typeof SetPlansReviewRowSchema>;
export type SetPlansReviewPhase = z.infer<typeof SetPlansReviewPhaseSchema>;
export type SetPlansReviewSection = z.infer<typeof SetPlansReviewSectionSchema>;
export type SetPlansPreviewReview = z.infer<typeof SetPlansPreviewReviewSchema>;
