import type { AgentPricingConfig } from "@autumn/shared";
import type { UIMessage } from "ai";
import {
	Conversation,
	ConversationContent,
} from "@/components/ai-elements/conversation";
import {
	Message,
	MessageContent,
	MessageResponse,
} from "@/components/ai-elements/message";
import {
	PromptInput,
	PromptInputBody,
	PromptInputFooter,
	type PromptInputMessage,
	PromptInputSubmit,
	PromptInputTextarea,
} from "@/components/ai-elements/prompt-input";
import { Shimmer } from "@/components/ai-elements/shimmer";
import { Button } from "@/components/v2/buttons/Button";
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
}

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
}: PricingChatPanelProps) {
	return (
		<div className={cn("flex flex-col min-h-0", className)}>
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
														<span className="text-t4">
															Error generating pricing
														</span>
													) : (
														<>
															<span className="text-t4 font-normal">
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
																	className="text-t3 text-xs"
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
					{isLoading &&
						messages.length > 0 &&
						messages[messages.length - 1]?.role === "user" && (
							<div className="flex items-center gap-2 text-t3 text-sm">
								<Shimmer>Planning next steps</Shimmer>
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
