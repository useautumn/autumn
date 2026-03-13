import { z } from "zod/v4";
export const ExpandParamSchema = z.array(z.string()).optional().meta({
	description: "Expand the response with additional data.",
});
