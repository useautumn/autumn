import { z } from "zod/v4";
import { createRoute } from "@/honoMiddlewares/routeHandler.js";

const SubmitFeedbackSchema = z.object({
	feedback: z.string().min(1),
});

export const handleSubmitFeedback = createRoute({
	body: SubmitFeedbackSchema,
	handler: async (c) => {
		const { feedback } = c.req.valid("json");
		const ctx = c.get("ctx");

		const userEmail = ctx.user?.email ?? "Unknown user";
		const orgSlug = ctx.org?.slug ?? "Unknown org";

		const webhookUrl = process.env.DISCORD_FEEDBACK_WEBHOOK;
		if (!webhookUrl) {
			console.warn("DISCORD_FEEDBACK_WEBHOOK not configured");
			return c.json({ success: true });
		}

		try {
			await fetch(webhookUrl, {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({
					content: `**New Feedback**\n\n**From:** ${userEmail}\n**Org:** ${orgSlug}\n\n${feedback}`,
				}),
			});
		} catch (error) {
			console.error("Failed to send feedback to Discord:", error);
		}

		return c.json({ success: true });
	},
});
