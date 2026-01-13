import { useChat } from "@ai-sdk/react";
import {
	DefaultChatTransport,
	lastAssistantMessageIsCompleteWithToolCalls,
} from "ai";
import { ArrowLeft, ImageIcon, MessageSquareText } from "lucide-react";
import { useCallback, useRef, useState } from "react";
import { useNavigate } from "react-router";
import {
	Conversation,
	ConversationContent,
	ConversationEmptyState,
} from "@/components/ai-elements/conversation";
import {
	Message,
	MessageContent,
	MessageResponse,
} from "@/components/ai-elements/message";
import {
	PromptInput,
	PromptInputAttachment,
	PromptInputAttachments,
	PromptInputBody,
	PromptInputButton,
	PromptInputFooter,
	PromptInputHeader,
	type PromptInputMessage,
	PromptInputSubmit,
	PromptInputTextarea,
	usePromptInputAttachments,
} from "@/components/ai-elements/prompt-input";
import { Shimmer } from "@/components/ai-elements/shimmer";
import { Button } from "@/components/v2/buttons/Button";
import { pushPage } from "@/utils/genUtils";
import { PricingConfigSheet } from "./PricingConfigSheet";
import { PricingPreview } from "./PricingPreview";
import type { AgentPricingConfig } from "./pricingAgentUtils";

interface AIChatViewProps {
	onBack: () => void;
}

function ImageUploadButton({ disabled }: { disabled?: boolean }) {
	const attachments = usePromptInputAttachments();

	return (
		<PromptInputButton
			onClick={() => attachments.openFileDialog()}
			disabled={disabled}
			title="Add image"
		>
			<ImageIcon className="size-4" />
		</PromptInputButton>
	);
}

// Type for the build_pricing tool part
type BuildPricingToolPart = {
	type: "tool-build_pricing";
	toolCallId: string;
	toolName: "build_pricing";
	state:
		| "input-streaming"
		| "input-available"
		| "output-available"
		| "output-error";
	input?: AgentPricingConfig;
	output?: unknown;
	errorText?: string;
};

interface PreviewOrg {
	apiKey: string;
	orgId: string;
	orgSlug: string;
}

export function AIChatView({ onBack }: AIChatViewProps) {
	const navigate = useNavigate();
	const [input, setInput] = useState("");
	const [pricingConfig, setPricingConfig] = useState<AgentPricingConfig | null>(
		null,
	);
	const [jsonSheetConfig, setJsonSheetConfig] =
		useState<AgentPricingConfig | null>(null);
	const [previewOrg, setPreviewOrg] = useState<PreviewOrg | null>(null);
	const [isPreviewSyncing, setIsPreviewSyncing] = useState(false);
	const previewSetupRef = useRef<Promise<PreviewOrg | null> | null>(null);

	/** Setup the preview org (called once, memoized) */
	const setupPreviewOrg = useCallback(async (): Promise<PreviewOrg | null> => {
		// If already setting up, return the existing promise
		if (previewSetupRef.current) {
			return previewSetupRef.current;
		}

		const setupPromise = (async () => {
			try {
				console.log("[Preview] Setting up preview org...");
				const response = await fetch(
					`${import.meta.env.VITE_BACKEND_URL}/pricing-agent/preview/setup`,
					{
						method: "POST",
						credentials: "include",
						headers: {
							"x-client-type": "dashboard",
							"Content-Type": "application/json",
						},
					},
				);

				if (!response.ok) {
					const error = await response.json();
					console.error("[Preview] Setup failed:", error);
					return null;
				}

				const data = await response.json();
				const org: PreviewOrg = {
					apiKey: data.api_key,
					orgId: data.org_id,
					orgSlug: data.org_slug,
				};
				console.log("[Preview] Setup complete:", {
					orgId: org.orgId,
					orgSlug: org.orgSlug,
				});
				setPreviewOrg(org);
				return org;
			} catch (error) {
				console.error("[Preview] Setup error:", error);
				return null;
			}
		})();

		previewSetupRef.current = setupPromise;
		return setupPromise;
	}, []);

	/** Sync pricing config to the preview org */
	const syncPreviewPricing = useCallback(
		async (config: AgentPricingConfig) => {
			// Ensure preview org is set up
			let org = previewOrg;
			if (!org) {
				org = await setupPreviewOrg();
				if (!org) {
					console.error("[Preview] Cannot sync - preview org not available");
					return;
				}
			}

			setIsPreviewSyncing(true);
			try {
				console.log("[Preview] Syncing pricing config...");
				console.log("[Preview] Features:", config.features.length);
				console.log("[Preview] Products:", config.products.length);

				const response = await fetch(
					`${import.meta.env.VITE_BACKEND_URL}/pricing-agent/preview/sync`,
					{
						method: "POST",
						credentials: "include",
						headers: {
							"x-client-type": "dashboard",
							"Content-Type": "application/json",
						},
						body: JSON.stringify({
							features: config.features,
							products: config.products,
						}),
					},
				);

				if (!response.ok) {
					const error = await response.json();
					console.error("[Preview] Sync failed:", error);
					return;
				}

				const result = await response.json();
				console.log("[Preview] Sync complete:", result);
			} catch (error) {
				console.error("[Preview] Sync error:", error);
			} finally {
				setIsPreviewSyncing(false);
			}
		},
		[previewOrg, setupPreviewOrg],
	);

	const { messages, sendMessage, status, addToolOutput } = useChat({
		transport: new DefaultChatTransport({
			api: `${import.meta.env.VITE_BACKEND_URL}/pricing-agent/chat`,
			credentials: "include",
			headers: {
				"x-client-type": "dashboard",
			},
		}),

		// Auto-submit when all tool results are available (for multi-step if needed)
		sendAutomaticallyWhen: lastAssistantMessageIsCompleteWithToolCalls,

		// Handle client-side tool execution
		onToolCall: async ({ toolCall }) => {
			// Check for dynamic tools first
			if (toolCall.dynamic) {
				return;
			}

			if (toolCall.toolName === "build_pricing") {
				const config = toolCall.input as AgentPricingConfig;

				// Update the pricing preview
				setPricingConfig(config);

				// Sync to preview org (fire and forget)
				syncPreviewPricing(config);

				// Return the tool result (no await to avoid deadlocks)
				addToolOutput({
					tool: "build_pricing",
					toolCallId: toolCall.toolCallId,
					output: {
						success: true,
						productsCount: config.products.length,
						featuresCount: config.features.length,
					},
				});
			}
		},
	});

	const handleCopyPlans = () => {
		pushPage({ path: "/products", navigate });
	};

	const handleSubmit = (message: PromptInputMessage) => {
		if (
			(!message.text.trim() && message.files.length === 0) ||
			status !== "ready"
		)
			return;

		sendMessage({
			text: message.text,
			files: message.files,
		});
		setInput("");
	};

	const isLoading = status === "streaming" || status === "submitted";

	return (
		<div className="w-full h-full flex flex-col bg-background">
			{/* Header */}
			<div className="flex items-center gap-3 px-6 py-4 border-b">
				<button
					type="button"
					onClick={onBack}
					className="p-1.5 rounded-lg hover:bg-interactive-secondary transition-colors"
				>
					<ArrowLeft className="size-5 text-t2" />
				</button>
				<h1 className="text-lg font-medium text-foreground">
					Describe your pricing
				</h1>
			</div>

			{/* Main content - split view */}
			<div className="flex-1 flex min-h-0">
				{/* Left: Chat */}
				<div className="w-1/2 flex flex-col border-r">
					<Conversation className="flex-1">
						<ConversationContent className="px-6">
							{messages.length === 0 && !isLoading ? (
								<ConversationEmptyState
									icon={<MessageSquareText className="size-8" />}
									title="Tell me about your pricing"
									description="Describe your ideal pricing model and I'll help you build it. For example: 'I want a freemium model with usage-based pricing for API calls.'"
								/>
							) : (
								<>
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
															const isImage =
																part.mediaType?.startsWith("image/");
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
																				Generated{" "}
																				{toolPart.input?.products.length ?? 0}{" "}
																				product(s) and{" "}
																				{toolPart.input?.features.length ?? 0}{" "}
																				feature(s)
																			</span>
																			<Button
																				variant="secondary"
																				size="sm"
																				onClick={() =>
																					setJsonSheetConfig(
																						toolPart.input ?? null,
																					)
																				}
																				className="text-t3 text-xs"
																			>
																				View JSON
																			</Button>
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
								</>
							)}
						</ConversationContent>
					</Conversation>

					<div className="px-6 pb-6 pt-2 border-t">
						<PromptInput onSubmit={handleSubmit} accept="image/*" multiple>
							<PromptInputHeader>
								<PromptInputAttachments>
									{(attachment) => <PromptInputAttachment data={attachment} />}
								</PromptInputAttachments>
							</PromptInputHeader>
							<PromptInputBody>
								<PromptInputTextarea
									value={input}
									onChange={(e) => setInput(e.target.value)}
									placeholder="Describe your pricing model..."
									disabled={isLoading}
								/>
							</PromptInputBody>
							<PromptInputFooter className="justify-between">
								<ImageUploadButton disabled={isLoading} />
								<PromptInputSubmit disabled={isLoading} />
							</PromptInputFooter>
						</PromptInput>
					</div>
				</div>

				{/* Right: Pricing Preview */}
				<div className="w-1/2 flex flex-col p-6">
					<div className="mb-4">
						<h2 className="text-sm font-medium text-t2">Preview</h2>
					</div>
					<PricingPreview
						config={pricingConfig}
						previewOrg={previewOrg}
						isSyncing={isPreviewSyncing}
					/>
					{pricingConfig && pricingConfig.products.length > 0 && (
						<div className="flex justify-end mt-4">
							<Button variant="primary" onClick={handleCopyPlans}>
								Copy plans to Autumn
							</Button>
						</div>
					)}
				</div>
			</div>

			<PricingConfigSheet
				open={jsonSheetConfig !== null}
				onOpenChange={(open) => !open && setJsonSheetConfig(null)}
				config={jsonSheetConfig}
			/>
		</div>
	);
}
