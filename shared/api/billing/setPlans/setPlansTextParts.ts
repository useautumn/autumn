import { z } from "zod/v4";

export const SetPlansTextPartSchema = z.object({
	text: z.string(),
	bold: z.boolean().optional(),
	attach: z.boolean().optional(),
});

/** A run of Set Plans copy; bold parts are names, amounts and dates, attached parts follow the previous one without a space. */
export type SetPlansTextPart = z.infer<typeof SetPlansTextPartSchema>;

export const plainText = (text: string): SetPlansTextPart => ({ text });
export const boldText = (text: string): SetPlansTextPart => ({
	text,
	bold: true,
});

/** The copy's own punctuation, kept out of a bold name or date so the name's own characters stay intact. */
export const punctuationText = (text: string): SetPlansTextPart => ({
	text,
	attach: true,
});

/** The parts as one plain sentence. */
export const textPartsToText = (parts: SetPlansTextPart[]) =>
	parts
		.map(({ text, attach }, index) =>
			index === 0 || attach ? text : ` ${text}`,
		)
		.join("");
