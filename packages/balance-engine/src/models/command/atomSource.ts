import { z } from "zod/v4";
import { nonEmptyStringSchema } from "../common/primitives.js";

/** The Atom that granted a command, its journal (writer) and seq there: stamped by the server on `tracks.append`. */
export const atomSourceSchema = z
	.object({
		atomId: nonEmptyStringSchema,
		writerId: nonEmptyStringSchema,
		seq: z.number().int().positive(),
	})
	.loose();

export type AtomSource = z.infer<typeof atomSourceSchema>;
