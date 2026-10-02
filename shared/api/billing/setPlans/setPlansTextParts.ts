import { z } from "zod/v4";

export const SetPlansTextPartSchema = z.object({
	text: z.string(),
	bold: z.boolean().optional(),
});

/** A run of Set Plans copy; bold parts are names, amounts and dates. */
export type SetPlansTextPart = z.infer<typeof SetPlansTextPartSchema>;

export const plainText = (text: string): SetPlansTextPart => ({ text });
export const boldText = (text: string): SetPlansTextPart => ({
	text,
	bold: true,
});

/** The parts as one plain sentence. */
export const textPartsToText = (parts: SetPlansTextPart[]) =>
	parts.map(({ text }) => text).join(" ");
