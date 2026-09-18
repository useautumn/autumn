import { createOpenAI } from "@ai-sdk/openai";
import { defineAgent } from "eve";
import { modelTraceFetch } from "../lib/modelTrace.js";

export default defineAgent({
	model: createOpenAI({
		apiKey: process.env.OPENROUTER_API_KEY,
		baseURL: "https://openrouter.ai/api/v1",
		fetch: modelTraceFetch,
	}).chat(process.env.LEAF_LAB_MODEL ?? "google/gemini-3.8-flash:nitro"),
	modelContextWindowTokens: 1_000_000,
	reasoning: "low",
});
