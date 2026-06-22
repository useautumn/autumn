# @useautumn/gateway

[Autumn](https://useautumn.com) adapters for AI SDKs and gateways. Wrap your model or client once and every LLM call's token usage is tracked against the customer's AI credit balance — no manual `trackTokens` calls.

Autumn converts the token counts to a dollar cost server-side using live [models.dev](https://models.dev) rates plus your configured markup, so pricing changes never require a client redeploy.

## Install

```bash
npm install @useautumn/gateway
# or
bun add @useautumn/gateway
```

Authentication: pass an `autumn` client (from `autumn-js`), or set `AUTUMN_API_KEY` (or `AUTUMN_SECRET_KEY`) in the environment and omit it.

## Vercel AI SDK

```ts
import { openai } from "@ai-sdk/openai";
import { generateText } from "ai";
import { withAutumn } from "@useautumn/gateway/ai-sdk";

const model = withAutumn({
  model: openai("gpt-4o"),
  customerId: "user_123",
});

const { text } = await generateText({ model, prompt: "Hello!" });
// usage tracked automatically — streaming too
```

The wrapped model is a drop-in `LanguageModelV3`. Usage is read from the response (or the stream's finish chunk) and reported as `<provider>/<model>` (e.g. `anthropic/claude-sonnet-4-5`). If your provider's name doesn't match its models.dev key, override it with `providerId`.

## OpenRouter

```ts
import { OpenRouter } from "@openrouter/sdk";
import { withAutumn, trackingSettled } from "@useautumn/gateway/openrouter";

const client = withAutumn({
  openRouter: new OpenRouter({ apiKey: process.env.OPENROUTER_API_KEY }),
  customerId: "user_123",
});

const result = await client.chat.send({
  model: "openai/gpt-4o",
  messages: [{ role: "user", content: "Hello!" }],
});
```

The wrapper forces OpenRouter usage accounting on every request, tracks `chat.send` (streaming and non-streaming) and the responses API (including `@openrouter/agent`'s `callModel`), and reports models as `openrouter/<slug>` using the response's resolved model — router aliases like `openrouter/auto` bill against the model that actually served the request. OpenRouter's own reported charge is attached to each event as `openrouter_cost`.

Streaming usage is tracked in the background; call `await trackingSettled(client)` before reading balances that must reflect calls just made. For consumption patterns the wrapper doesn't cover, `trackOpenRouterUsage({ usage, model, customerId })` accepts both SDK camelCase and raw snake_case usage objects.

## Options

Both adapters accept the shared tracking options:

| Option | Required | Description |
|--------|----------|-------------|
| `customerId` | Yes | Autumn customer ID to attribute usage to |
| `autumn` | No | `autumn-js` client; falls back to `AUTUMN_API_KEY` env |
| `featureId` | No | Target AI credit system feature (auto-detected if you have one) |
| `entityId` | No | Entity for entity-scoped balances |
| `properties` | No | Extra properties attached to each usage event |

Tracking failures are caught and logged — they never break your AI responses.

## Docs

- [Vercel AI SDK guide](https://docs.useautumn.com/documentation/external-providers/ai-sdk)
- [OpenRouter guide](https://docs.useautumn.com/documentation/external-providers/openrouter)
- [trackTokens API reference](https://docs.useautumn.com/api-reference/balances/trackTokens)
