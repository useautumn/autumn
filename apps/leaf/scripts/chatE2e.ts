/** Dead-simple e2e driver for the dashboard chat stream, no browser needed.
 *
 *   bun scripts/chatE2e.ts "update pro plan to $45/mo"      # new thread
 *   bun scripts/chatE2e.ts --follow "yes do it"             # same thread
 *   bun scripts/chatE2e.ts --answer <requestId> <optionId>  # answer a question chip
 *
 * Reads the dashboard session cookie from LEAF_COOKIE or LEAF_COOKIE_FILE.
 * Prints every stream part as one line; thread id persists in /tmp.
 */
const LEAF_URL = process.env.LEAF_URL ?? "http://localhost:3099";
const THREAD_FILE = "/tmp/leaf-e2e-thread.txt";

const cookie =
	process.env.LEAF_COOKIE ??
	(process.env.LEAF_COOKIE_FILE
		? (await Bun.file(process.env.LEAF_COOKIE_FILE).text()).trim()
		: undefined);
if (!cookie) throw new Error("Set LEAF_COOKIE or LEAF_COOKIE_FILE");

const args = process.argv.slice(2);
const follow = args[0] === "--follow";
const answer = args[0] === "--answer";
// --catalog <planId> <versioning> <migrate> <variantCsv|-> : submit a decision
const catalog = args[0] === "--catalog";
const text = answer
	? (args[3] ?? args[2])
	: catalog
		? `Apply the change now with these confirmed choices for ${args[1]}: ${args[2]}, migration draft ${args[3]}, propagate to ${args[4] === "-" ? "none" : args[4]}. This is the confirmation — call updateCatalog immediately.`
		: (args.at(-1) ?? "hello");

const threadId =
	follow || answer || catalog
		? (await Bun.file(THREAD_FILE).text()).trim()
		: crypto.randomUUID();
await Bun.write(THREAD_FILE, threadId);

const metadata = answer
	? { questionResponse: { optionId: args[2], requestId: args[1] } }
	: catalog
		? {
				catalogDecision: {
					migrationDraft: args[3] === "true",
					planId: args[1],
					propagateVariantIds:
						args[4] === "-" ? [] : (args[4] ?? "").split(","),
					versioning: args[2],
				},
			}
		: undefined;

const response = await fetch(`${LEAF_URL}/agent/chat`, {
	method: "POST",
	headers: {
		"content-type": "application/json",
		cookie,
		app_env: "sandbox",
	},
	body: JSON.stringify({
		id: threadId,
		messages: [
			{
				id: crypto.randomUUID(),
				role: "user",
				parts: [{ text, type: "text" }],
				metadata,
			},
		],
	}),
});
console.log(`thread=${threadId} status=${response.status}`);
if (!response.body) throw new Error("no body");

let textBuffer = "";
const decoder = new TextDecoder();
let sse = "";
for await (const chunk of response.body) {
	sse += decoder.decode(chunk, { stream: true });
	let index = sse.indexOf("\n");
	while (index >= 0) {
		const line = sse.slice(0, index).trim();
		sse = sse.slice(index + 1);
		index = sse.indexOf("\n");
		if (!line.startsWith("data: ") || line === "data: [DONE]") continue;
		const part = JSON.parse(line.slice(6));
		if (part.type === "text-delta") {
			textBuffer += part.delta;
		} else if (part.type === "text-end") {
			console.log(`TEXT   | ${textBuffer.replaceAll("\n", " ⏎ ")}`);
			textBuffer = "";
		} else if (part.type?.startsWith("data-")) {
			console.log(
				`${part.type.slice(5).toUpperCase().padEnd(6)} |`,
				JSON.stringify(part.data).slice(0, 300),
			);
		} else if (part.type === "error") {
			console.log("ERROR  |", JSON.stringify(part).slice(0, 500));
		}
	}
}
console.log("-- stream closed --");
