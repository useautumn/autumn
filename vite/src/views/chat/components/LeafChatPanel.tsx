import {
	Conversation,
	ConversationContent,
	Message,
	MessageContent,
	MessageResponse,
	PromptInput,
	PromptInputBody,
	PromptInputFooter,
	type PromptInputMessage,
	PromptInputSubmit,
	PromptInputTextarea,
	Shimmer,
} from "@autumn/ui/ai-elements";
import type { ReactNode } from "react";
import type { DecidingState, LeafUIMessage } from "../chatTypes";
import { ApprovalCard } from "./ApprovalCard";
import { ToolStepsGroup, type WorkedEntry } from "./ToolSteps";

interface LeafChatPanelProps {
	messages: LeafUIMessage[];
	input: string;
	onInputChange: (value: string) => void;
	onSubmit: (message: PromptInputMessage) => void;
	isLoading: boolean;
	onApprove: (approvalId: string) => void;
	onReject: (approvalId: string) => void;
	deciding: DecidingState;
	placeholder?: string;
}

/** Render a message's parts, grouping consecutive tool steps into one
 * collapsible block so the thread reads as text + a tidy step list + cards. */
function renderParts({
	deciding,
	message,
	onApprove,
	onReject,
}: {
	deciding: DecidingState;
	message: LeafUIMessage;
	onApprove: (approvalId: string) => void;
	onReject: (approvalId: string) => void;
}): ReactNode[] {
	const nodes: ReactNode[] = [];
	// The agent's text is process narration (reasoning) when it leads up to an
	// action — it precedes the final tool call, or the message ends in an approval
	// card (the card is the real result). Otherwise it's the answer. Reasoning +
	// steps fold under the "Worked" group.
	const lastStepIndex = message.parts.reduce(
		(last, part, index) => (part.type === "data-step" ? index : last),
		-1,
	);
	const hasApproval = message.parts.some(
		(part) => part.type === "data-approval",
	);
	let workRun: WorkedEntry[] = [];
	const flushWork = (key: string) => {
		if (workRun.length === 0) return;
		nodes.push(<ToolStepsGroup key={`work-${key}`} entries={workRun} />);
		workRun = [];
	};

	let partIndex = 0;
	for (const part of message.parts) {
		const key = String(partIndex);
		const index = partIndex;
		partIndex += 1;
		if (part.type === "data-step") {
			workRun.push({ step: part.data, type: "step" });
			continue;
		}
		if (part.type === "text" && (index < lastStepIndex || hasApproval)) {
			if (part.text.trim()) {
				workRun.push({ text: part.text, type: "reasoning" });
			}
			continue;
		}
		flushWork(key);
		if (part.type === "text") {
			nodes.push(<MessageResponse key={key}>{part.text}</MessageResponse>);
		} else if (part.type === "data-approval") {
			nodes.push(
				<ApprovalCard
					key={part.data.approvalId}
					approval={part.data}
					deciding={deciding}
					onApprove={onApprove}
					onReject={onReject}
				/>,
			);
		} else if (part.type === "file" && part.mediaType?.startsWith("image/")) {
			if (part.url) {
				nodes.push(
					<div
						key={key}
						className="flex w-fit items-center gap-1.5 rounded-md border border-border px-1.5 py-1"
					>
						<img
							src={part.url}
							alt={part.filename || "Attached image"}
							className="w-72 rounded object-cover"
						/>
					</div>,
				);
			}
		}
	}
	flushWork("end");
	return nodes;
}

/** Leaf chat: text/image messages, with grouped tool steps + an inline approval
 * card (one tool result → one card in the thread). */
export function LeafChatPanel({
	messages,
	input,
	onInputChange,
	onSubmit,
	isLoading,
	onApprove,
	onReject,
	deciding,
	placeholder = "Ask Autumn anything…",
}: LeafChatPanelProps) {
	// Show "Thinking…" whenever we're waiting on the agent — while the stream is
	// active (it can send several messages back-to-back), or while an approval is
	// resuming the turn.
	const showThinking = isLoading || Boolean(deciding);

	return (
		<div
			className="flex min-h-0 flex-1 flex-col text-[13px]"
			style={{ fontFamily: '"Geist", sans-serif' }}
		>
			<Conversation className="flex-1">
				<ConversationContent className="px-5">
					{messages.map((message) => (
						<Message key={message.id} from={message.role}>
							<MessageContent
								className={message.role === "assistant" ? "w-full" : undefined}
							>
								{renderParts({ deciding, message, onApprove, onReject })}
							</MessageContent>
						</Message>
					))}

					{showThinking && (
						<div className="flex items-center gap-2 text-sm text-tertiary-foreground">
							<Shimmer>Thinking…</Shimmer>
						</div>
					)}
				</ConversationContent>
			</Conversation>

			<div className="px-5 pt-2 pb-5">
				<PromptInput onSubmit={onSubmit} accept="image/*" multiple>
					<PromptInputBody>
						<PromptInputTextarea
							value={input}
							onChange={(e) => onInputChange(e.target.value)}
							placeholder={placeholder}
							disabled={isLoading}
						/>
					</PromptInputBody>
					<PromptInputFooter className="justify-end">
						<PromptInputSubmit disabled={isLoading} variant="primary" />
					</PromptInputFooter>
				</PromptInput>
			</div>
		</div>
	);
}
