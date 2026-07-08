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
import { ArrowUpIcon } from "@phosphor-icons/react";
import type { ReactNode } from "react";
import { cn } from "@/lib/utils";
import type {
	DecidingState,
	LeafCatalogDecision,
	LeafQuestionResponse,
	LeafUIMessage,
} from "../chatTypes";
import { ApprovalCard } from "./ApprovalCard";
import { CatalogDecisionCard } from "./CatalogDecisionCard";
import { QuestionOptions } from "./QuestionOptions";
import { ToolStepsGroup, type WorkedEntry } from "./ToolSteps";

interface LeafChatPanelProps {
	messages: LeafUIMessage[];
	input: string;
	onInputChange: (value: string) => void;
	onSubmit: (message: PromptInputMessage) => void;
	isLoading: boolean;
	onApprove: (approvalId: string) => void;
	onReject: (approvalId: string) => void;
	onAnswerQuestion: (
		messageId: string,
		answer: string,
		response?: LeafQuestionResponse,
	) => void;
	onSubmitCatalogDecision: (
		messageId: string,
		decision: LeafCatalogDecision,
	) => void;
	deciding: DecidingState;
	error?: Error;
	placeholder?: string;
	queue: PromptInputMessage[];
	onSendQueuedNow: () => void;
	onRemoveQueued: (index: number) => void;
	// Constrains/centers the thread + composer (e.g. expanded mode) while the
	// scroll container spans full width so the scrollbar hugs the panel edge.
	contentClassName?: string;
}

type RenderSegment =
	| { kind: "work"; entries: WorkedEntry[] }
	| { kind: "node"; node: ReactNode };

/** Render a message's parts, grouping consecutive tool steps into one
 * collapsible block so the thread reads as text + a tidy step list + cards.
 * `streaming` marks the message as the live turn: its tail work group stays
 * open ("Working…") until the stream finishes, instead of flapping with
 * per-step status. */
function renderParts({
	deciding,
	message,
	onApprove,
	onReject,
	onAnswerQuestion,
	onSubmitCatalogDecision,
	streaming,
}: {
	deciding: DecidingState;
	message: LeafUIMessage;
	onApprove: (approvalId: string) => void;
	onReject: (approvalId: string) => void;
	onAnswerQuestion: (
		messageId: string,
		answer: string,
		response?: LeafQuestionResponse,
	) => void;
	onSubmitCatalogDecision: (
		messageId: string,
		decision: LeafCatalogDecision,
	) => void;
	streaming: boolean;
}): ReactNode[] {
	const segments: RenderSegment[] = [];
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
	const flushWork = () => {
		if (workRun.length === 0) return;
		segments.push({ entries: workRun, kind: "work" });
		workRun = [];
	};
	const pushNode = (node: ReactNode) => {
		flushWork();
		segments.push({ kind: "node", node });
	};

	let partIndex = 0;
	for (const part of message.parts) {
		const key = String(partIndex);
		const index = partIndex;
		partIndex += 1;
		if (part.type === "data-step") {
			workRun.push({ step: part.data, type: "step" });
		} else if (part.type === "data-reasoning") {
			if (part.data.text.trim()) {
				workRun.push({ text: part.data.text, type: "reasoning" });
			}
		} else if (part.type === "text" && (index < lastStepIndex || hasApproval)) {
			if (part.text.trim()) {
				workRun.push({ text: part.text, type: "reasoning" });
			}
		} else if (part.type === "text") {
			pushNode(<MessageResponse key={key}>{part.text}</MessageResponse>);
		} else if (part.type === "data-approval") {
			pushNode(
				<ApprovalCard
					key={part.data.approvalId}
					approval={part.data}
					deciding={deciding}
					onApprove={onApprove}
					onReject={onReject}
				/>,
			);
		} else if (part.type === "data-question") {
			pushNode(
				<QuestionOptions
					key={key}
					onAnswer={(answer, response) =>
						onAnswerQuestion(message.id, answer, response)
					}
					question={part.data}
				/>,
			);
		} else if (part.type === "data-catalog-decision") {
			pushNode(
				<CatalogDecisionCard
					key={part.data.plan.plan_id}
					onSubmit={(decision) => onSubmitCatalogDecision(message.id, decision)}
					plan={part.data.plan}
					status={part.data.status}
				/>,
			);
		} else if (
			part.type === "file" &&
			part.mediaType?.startsWith("image/") &&
			part.url
		) {
			pushNode(
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
	flushWork();

	// Key work groups by their ordinal among work groups (stable as trailing
	// parts stream in); only the tail group of a live turn shows "Working…".
	let workOrdinal = 0;
	return segments.map((segment, index) => {
		if (segment.kind === "node") return segment.node;
		const key = `work-${workOrdinal}`;
		workOrdinal += 1;
		return (
			<ToolStepsGroup
				active={streaming && index === segments.length - 1}
				entries={segment.entries}
				key={key}
			/>
		);
	});
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
	onAnswerQuestion,
	onSubmitCatalogDecision,
	deciding,
	error,
	placeholder = "Ask Autumn anything…",
	queue,
	onSendQueuedNow,
	onRemoveQueued,
	contentClassName,
}: LeafChatPanelProps) {
	const lastMessage = messages[messages.length - 1];
	const streamingMessageId =
		isLoading && lastMessage?.role === "assistant" ? lastMessage.id : undefined;
	// Exactly one progress indicator at a time: "Thinking…" only before the
	// assistant message has anything to show — once parts stream in, the
	// "Working…" group (or the streaming text itself) takes over.
	const streamingHasContent = Boolean(
		streamingMessageId && lastMessage && lastMessage.parts.length > 0,
	);
	const showThinking = Boolean(deciding) || (isLoading && !streamingHasContent);

	return (
		<div
			className="flex min-h-0 flex-1 flex-col text-[13px]"
			style={{ fontFamily: '"Geist", sans-serif' }}
		>
			<Conversation className="flex-1">
				<ConversationContent className={cn("gap-6 px-4", contentClassName)}>
					{messages.map((message) => (
						<Message key={message.id} from={message.role}>
							<MessageContent
								className={
									message.role === "assistant"
										? "w-full"
										: "group-[.is-user]:px-3 group-[.is-user]:py-1.5"
								}
							>
								{renderParts({
									deciding,
									message,
									onApprove,
									onReject,
									onAnswerQuestion,
									onSubmitCatalogDecision,
									streaming: message.id === streamingMessageId,
								})}
							</MessageContent>
						</Message>
					))}

					{showThinking && (
						<div className="flex items-center gap-2 text-sm text-tertiary-foreground">
							<Shimmer>Thinking…</Shimmer>
						</div>
					)}

					{/* A dead turn must never fail silently — that's how "the agent
					    just stopped" bugs hide. */}
					{error && !isLoading && (
						<span className="text-red-600 text-xs dark:text-red-500">
							Something went wrong mid-turn — send your message again.
						</span>
					)}
				</ConversationContent>
			</Conversation>

			<div className={cn("px-4 pt-1 pb-4", contentClassName)}>
				{queue.map((queuedMessage, index) => (
					<div
						className="mb-2 flex items-center gap-2 rounded-md border border-border/60 bg-secondary/30 px-3 py-1.5 text-sm"
						key={`${queuedMessage.text}-${index}`}
					>
						<span className="rounded bg-secondary px-1.5 py-0.5 text-[10px] text-tertiary-foreground uppercase">
							Queued
						</span>
						<span className="min-w-0 flex-1 truncate text-foreground">
							{queuedMessage.text}
						</span>
						{index === 0 && (
							<button
								className="shrink-0 text-tertiary-foreground text-xs hover:text-foreground"
								onClick={onSendQueuedNow}
								type="button"
							>
								Send now
							</button>
						)}
						<button
							aria-label="Remove queued message"
							className="shrink-0 text-tertiary-foreground text-xs hover:text-foreground"
							onClick={() => onRemoveQueued(index)}
							type="button"
						>
							✕
						</button>
					</div>
				))}
				<PromptInput
					onSubmit={onSubmit}
					accept="image/*"
					multiple
					className="[&_[data-slot=prompt-input]]:rounded-xl [&_[data-slot=prompt-input]]:shadow-sm"
				>
					<PromptInputBody>
						{/* Keep the composer typable during a turn (like Claude/ChatGPT);
						    only submission is gated on the stream finishing. */}
						<PromptInputTextarea
							className="max-h-40 min-h-9 px-3 py-2.5 text-[13px]"
							value={input}
							onChange={(e) => onInputChange(e.target.value)}
							placeholder={placeholder}
						/>
					</PromptInputBody>
					<PromptInputFooter className="justify-end px-2 pb-2">
						{/* Never disabled: submit must fire mid-turn so handleSubmit can
						    queue the message (Enter is a no-op when this is disabled). */}
						<PromptInputSubmit
							className="size-6 rounded-full"
							variant="primary"
						>
							<ArrowUpIcon size={13} weight="bold" />
						</PromptInputSubmit>
					</PromptInputFooter>
				</PromptInput>
			</div>
		</div>
	);
}
