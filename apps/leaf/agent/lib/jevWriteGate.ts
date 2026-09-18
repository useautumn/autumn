import { assertExactRequestedBasePrice } from "../../../leaf-lab/lib/exactRequestedPrice.js";
import { askJev } from "../../../leaf-lab/lib/jev.js";
import { assertNoMinorUnitConversion } from "../../../leaf-lab/lib/requestedMoney.js";

type ConversationMessage = { role: string; content: unknown };

/** Experimental lab gate: Jev semantic verification plus deterministic price
 * guards on every gated write before leaf records it for approval. Opt-in so
 * the production agent path is unchanged unless explicitly enabled. */
export const jevWriteGateEnabled = () => process.env.LEAF_JEV_GATE === "1";

const textOf = (content: unknown): string => {
	if (typeof content === "string") return content;
	if (!Array.isArray(content)) return "";
	return content
		.flatMap((part) =>
			part && typeof part === "object" && typeof part.text === "string"
				? [part.text]
				: [],
		)
		.join("\n");
};

export const conversationText = (messages: readonly ConversationMessage[]) =>
	messages
		.filter(
			(message) => message.role === "user" || message.role === "assistant",
		)
		.map((message) => ({
			role: message.role,
			content: textOf(message.content),
		}))
		.filter((message) => message.content.trim());

const questions = {
	wrong_target:
		"Does the proposed write target a different customer, entity, plan or product family than the user's actual request in the full conversation? Similar plan names are not interchangeable.",
	wrong_price:
		"Does the proposed write contradict a user-requested price, currency, billing interval, invoice finalization, payment terms or proration choice, or introduce a custom base price the user did not request? Amounts are major currency units; unspecified terms may use defaults.",
	unrequested_mutation:
		"Does the resulting billing state change something the user did not request, such as removing existing paid pricing, features or trial terms? Removing and re-adding the same feature with a requested new allowance is a replacement, not a deletion. Read-only questions never authorize writes.",
	missing_terms:
		"Does the proposed write omit an explicitly requested allowance, feature, trial, cancellation timing, payment term or schedule date? Unspecified terms may use catalog defaults.",
};

export const verifyGatedWrite = async ({
	args,
	messages,
	toolName,
}: {
	args: Record<string, unknown>;
	messages: readonly ConversationMessage[];
	toolName: string;
}) => {
	const conversation = conversationText(messages);
	const actions = [{ name: toolName, args }];
	assertNoMinorUnitConversion({ messages: conversation, actions });
	const literalPriceCheck = assertExactRequestedBasePrice({
		messages: conversation,
		actions,
	});
	const started = performance.now();
	const answers = await askJev({
		state: {
			messages: conversation,
			proposal: {
				toolName,
				request: args.request,
				approval_description: args.approval_description,
			},
			literalPriceCheck,
			status:
				"Unexecuted proposed write awaiting human approval; nothing has been applied.",
		},
		questions,
		onMeasurement: () => {},
	});
	const failures = Object.entries(answers)
		.filter(([, probability]) => probability >= 0.5)
		.map(([name]) => name);
	if (failures.length)
		throw new Error(
			`Verification rejected this write before approval: ${failures.join(", ")}. Nothing was recorded and the user sees no card. Correct the request against the user's actual instructions and authoritative state, preview it again, then retry.`,
		);
	return {
		answers,
		durationMs: performance.now() - started,
		literalPriceCheck,
	};
};
