import { z } from "zod/v4";

export const SetPlansTextPartSchema = z.object({
	text: z.string(),
	bold: z.boolean().optional(),
	attach: z.boolean().optional(),
});

export type SetPlansTextPart = z.infer<typeof SetPlansTextPartSchema>;

export const plainText = (text: string): SetPlansTextPart => ({ text });
export const boldText = (text: string): SetPlansTextPart => ({
	text,
	bold: true,
});

export const punctuationText = (text: string): SetPlansTextPart => ({
	text,
	attach: true,
});

export const textPartsToText = (parts: SetPlansTextPart[]) =>
	parts
		.map(({ text, attach }, index) =>
			index === 0 || attach ? text : ` ${text}`,
		)
		.join("");
