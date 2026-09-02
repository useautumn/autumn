import { z } from "zod/v4";

export const PauseActionSchema = z.enum(["pause", "resume"]).meta({
	title: "PauseAction",
	description:
		"Action to perform for pausing. 'pause' stops payment collection on the subscription and marks it paused, 'resume' restarts collection and marks it active again.",
});

export type PauseAction = z.infer<typeof PauseActionSchema>;
