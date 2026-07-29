import type { AgentPricingConfig } from "@autumn/shared";
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
import {
	AttachmentsHeader,
	type BuildPricingToolPart,
	ImageUploadButton,
} from "./ChatInputComponents";

interface PricingChatPanelProps {
	messages: UIMessage[];
	input: string;
	onInputChange: (value: string) => void;
	onSubmit: (message: PromptInputMessage) => void;
	isLoading: boolean;
	onViewJson?: (config: AgentPricingConfig) => void;
	placeholder?: string;
	className?: string;
	inputClassName?: string;
	/** Per-surface overrides for the message bubble (e.g. tighter chat styling). */
	messageContentClassName?: string;
	/** Status shown while the agent is working before any reply text streams. */
	thinkingLabel?: string;
}

const hasAssistantText = (message?: UIMessage) =>
	message?.role === "assistant" &&
	message.parts.some(
		(part) => part.type === "text" && part.text.trim().length > 0,
	);

/**
 * Reusable chat panel for pricing agent conversations.
 * Renders messages list and prompt input.
 */
export function PricingChatPanel({
	messages,
	input,
	onInputChange,
	onSubmit,
	isLoading,
	onViewJson,
	placeholder = "Describe your app's pricing",
	className,
	inputClassName,
	messageContentClassName,
	thinkingLabel = "Planning next steps",
}: PricingChatPanelProps) {
	const showThinking = isLoading && !hasAssistantText(messages.at(-1));
	return (
		<div className={cn("flex flex-col min-h-0", className)}>
			<Conversation className="flex-1">
				<ConversationContent className="px-6">
					{messages.map((message) => (
						<Message key={message.id} from={message.role}>
							<MessageContent className={messageContentClassName}>
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

										case "tool-build_pricing": {
											const toolPart = part as BuildPricingToolPart;
											return (
												<div
													key={toolPart.toolCallId}
													className="flex items-center gap-3 text-sm"
												>
													{toolPart.state === "input-streaming" ||
													toolPart.state === "input-available" ? (
														<Shimmer className="text-sm">
															Building pricing configuration
														</Shimmer>
													) : toolPart.state === "output-error" ? (
														<span className="text-subtle">
															Error generating pricing
														</span>
													) : (
														<>
															<span className="text-subtle font-normal">
																Generated {toolPart.input?.products.length ?? 0}{" "}
																product(s) and{" "}
																{toolPart.input?.features.length ?? 0}{" "}
																feature(s)
															</span>
															{onViewJson && toolPart.input && (
																<Button
																	variant="secondary"
																	size="sm"
																	onClick={() => {
																		if (toolPart.input) {
																			onViewJson(toolPart.input);
																		}
																	}}
																	className="text-tertiary-foreground text-xs"
																>
																	View JSON
																</Button>
															)}
														</>
													)}
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
							<Shimmer>{thinkingLabel}</Shimmer>
						</div>
					)}
				</ConversationContent>
			</Conversation>

			<div className={cn("px-6 pb-6 pt-2", inputClassName)}>
				<PromptInput onSubmit={onSubmit} accept="image/*" multiple>
					<AttachmentsHeader />
					<PromptInputBody>
						<PromptInputTextarea
							value={input}
							onChange={(e) => onInputChange(e.target.value)}
							placeholder={placeholder}
							disabled={isLoading}
						/>
					</PromptInputBody>
					<PromptInputFooter className="justify-between">
						<ImageUploadButton disabled={isLoading} />
						<PromptInputSubmit disabled={isLoading} variant="primary" />
					</PromptInputFooter>
				</PromptInput>
			</div>
		</div>
	);
}
