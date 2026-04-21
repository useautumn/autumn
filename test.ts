import {
	withTokenTracking,
} from "./packages/ai-sdk/src";
import { Autumn } from "./packages/sdk/src";

const autumn = new Autumn({
	secretKey: "am_sk_test_OL2PpckWMRMsOjYv8TSURvaiCi8nIXv0V8lVWf5fQr",
	serverURL: "http://localhost:8080",
});

const openrouter = createOpenRouter({
	apiKey:
		"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",
});
const kimi = openrouter("moonshotai/kimi-k2.5");

const autumnKimi = withTokenTracking({
	autumn,
	model: kimi,
	customerId: "ayush",
	featureId: "ai_bro",
});

const response = await streamText({
	model: autumnKimi,
	prompt: "What is the meaning of life?",
});
console.log(response);
