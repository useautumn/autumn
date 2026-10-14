export type ChatMessage = {
	role: "system" | "user" | "assistant";
	content: string;
};

export const completeChat = async ({
	model,
	messages,
	jsonSchema,
}: {
	model: string;
	messages: ChatMessage[];
	jsonSchema?: { name: string; schema: Record<string, unknown> };
}): Promise<string> => {
	const apiKey = process.env.OPENROUTER_API_KEY;
	if (!apiKey) throw new Error("OPENROUTER_API_KEY is not set");

	const response = await fetch(
		"https://openrouter.ai/api/v1/chat/completions",
		{
			method: "POST",
			headers: {
				Authorization: `Bearer ${apiKey}`,
				"Content-Type": "application/json",
			},
			body: JSON.stringify({
				model,
				messages,
				temperature: 0,
				...(jsonSchema && {
					response_format: {
						type: "json_schema",
						json_schema: {
							name: jsonSchema.name,
							strict: true,
							schema: jsonSchema.schema,
						},
					},
				}),
			}),
		},
	);
	if (!response.ok) {
		throw new Error(
			`OpenRouter ${response.status}: ${(await response.text()).slice(0, 300)}`,
		);
	}
	const body = (await response.json()) as {
		choices?: { message?: { content?: string } }[];
	};
	const content = body.choices?.[0]?.message?.content;
	if (!content) throw new Error("OpenRouter returned an empty completion");
	return content;
};
