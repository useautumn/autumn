import { Button } from "@autumn/ui";
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
import type { UIMessage } from "ai";
import { cn } from "@/lib/utils";
import type { LeafApproval } from "./useLeafChat";

interface LeafChatPanelProps {
	messages: UIMessage[];
	input: string;
	onInputChange: (value: string) => void;
	onSubmit: (message: PromptInputMessage) => void;
	isLoading: boolean;
	pendingApproval: LeafApproval | null;
	onApprove: (approvalId: string) => void;
	onReject: (approvalId: string) => void;
	deciding: boolean;
	placeholder?: string;
}

const hasAssistantText = (message?: UIMessage) =>
	message?.role === "assistant" &&
	message.parts.some(
		(part) => part.type === "text" && part.text.trim().length > 0,
	);

const approvalSummary = (approval: LeafApproval): string => {
	const plans = approval.preview?.plans ?? [];
	const versioned = plans.filter((plan) => plan.will_version).length;
	const planLabel = `${plans.length} plan${plans.length === 1 ? "" : "s"}`;
	const versionNote =
		versioned > 0
			? ` · ${versioned} create${versioned === 1 ? "s" : ""} a new version`
			: "";
	return `Apply changes to ${planLabel}${versionNote}?`;
};

/** Leaf chat: text/image messages, with an inline approval card for the plan
 * write the agent has staged. The full plan preview renders in the side pane. */
export function LeafChatPanel({
	messages,
	input,
	onInputChange,
	onSubmit,
	isLoading,
	pendingApproval,
	onApprove,
	onReject,
	deciding,
	placeholder = "Ask Autumn anything…",
}: LeafChatPanelProps) {
	const showThinking = isLoading && !hasAssistantText(messages.at(-1));

	return (
		<div className="flex flex-col min-h-0 flex-1">
			<Conversation className="flex-1">
				<ConversationContent className="px-6">
					{messages.map((message) => (
						<Message key={message.id} from={message.role}>
							<MessageContent>
								{message.parts.map((part, partIndex) => {
									switch (part.type) {
										case "text":
											return (
												<MessageResponse key={partIndex}>
													{part.text}
												</MessageResponse>
											);
										case "file": {
											const isImage = part.mediaType?.startsWith("image/");
											if (!isImage || !part.url) return null;
											return (
												<div
													key={partIndex}
													className="flex items-center gap-1.5 rounded-md border border-border px-1.5 py-1 w-fit"
												>
													<img
														src={part.url}
														alt={part.filename || "Attached image"}
														className="w-90 rounded object-cover"
													/>
												</div>
											);
										}
										default:
											return null;
									}
								})}
							</MessageContent>
						</Message>
					))}

					{showThinking && (
						<div className="flex items-center gap-2 text-tertiary-foreground text-sm">
							<Shimmer>Thinking…</Shimmer>
						</div>
					)}

					{pendingApproval && (
						<div className="flex flex-col gap-2 rounded-md border border-border bg-secondary/40 p-3 text-sm">
							<span className="font-medium text-foreground">
								{approvalSummary(pendingApproval)}
							</span>
							<span className="text-tertiary-foreground text-xs">
								Review the plan in the panel, then apply or discard.
							</span>
							<div className="flex gap-2 pt-1">
								<Button
									variant="primary"
									size="sm"
									disabled={deciding}
									onClick={() => onApprove(pendingApproval.id)}
								>
									Apply
								</Button>
								<Button
									variant="secondary"
									size="sm"
									disabled={deciding}
									onClick={() => onReject(pendingApproval.id)}
								>
									Discard
								</Button>
							</div>
						</div>
					)}
				</ConversationContent>
			</Conversation>

			<div className={cn("px-6 pb-6 pt-2")}>
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
