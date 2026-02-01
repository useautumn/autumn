import { useChat } from "@ai-sdk/react";
import {
	DefaultChatTransport,
	lastAssistantMessageIsCompleteWithToolCalls,
} from "ai";
import { ImageIcon } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { useCallback, useId, useRef, useState } from "react";
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
import { useAxiosInstance } from "@/services/useAxiosInstance";
import { OrgDropdown } from "@/views/main-sidebar/components/OrgDropdown";
import { SidebarContext } from "@/views/main-sidebar/SidebarContext";
import { CopyPlansButton } from "./CopyPlansButton";
import { TemplatePrompts } from "./components/TemplatePrompts";
import { WelcomeHeader } from "./components/WelcomeHeader";
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

function AttachmentsHeader() {
	const attachments = usePromptInputAttachments();

	if (!attachments.files.length) {
		return null;
	}

	return (
		<PromptInputHeader>
			<PromptInputAttachments className="p-0 pt-2">
				{(attachment) => <PromptInputAttachment data={attachment} />}
			</PromptInputAttachments>
		</PromptInputHeader>
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
	const [input, setInput] = useState("");
	const [hasStartedChat, setHasStartedChat] = useState(false);
	const [pricingConfig, setPricingConfig] = useState<AgentPricingConfig | null>(
		null,
	);
	const [jsonSheetConfig, setJsonSheetConfig] =
		useState<AgentPricingConfig | null>(null);
	const [previewOrg, setPreviewOrg] = useState<PreviewOrg | null>(null);
	const [isPreviewSyncing, setIsPreviewSyncing] = useState(false);
	const previewSetupRef = useRef<Promise<PreviewOrg | null> | null>(null);
	const axiosInstance = useAxiosInstance();

	// Session ID for PostHog AI tracing - groups all messages in a conversation
	const reactId = useId();
	const chatSessionIdRef = useRef(`pricing-chat-${reactId}-${Date.now()}`);

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

				const response = await axiosInstance.post(
					"/pricing-agent/preview/sync",
					{
						features: config.features,
						products: config.products,
					},
				);

				console.log("[Preview] Sync complete:", response.data);
			} catch (error) {
				console.error("[Preview] Sync error:", error);
			} finally {
				setIsPreviewSyncing(false);
			}
		},
		[axiosInstance, previewOrg, setupPreviewOrg],
	);

	const { messages, sendMessage, status, addToolOutput } = useChat({
		transport: new DefaultChatTransport({
			api: `${import.meta.env.VITE_BACKEND_URL}/pricing-agent/chat`,
			credentials: "include",
			headers: {
				"x-client-type": "dashboard",
			},
			body: {
				sessionId: chatSessionIdRef.current,
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

	const handleSubmit = (message: PromptInputMessage) => {
		if (
			(!message.text.trim() && message.files.length === 0) ||
			status !== "ready"
		)
			return;

		setHasStartedChat(true);
		sendMessage({
			text: message.text,
			files: message.files,
		});
		setInput("");
	};

	const handleSelectTemplate = ({ prompt }: { prompt: string }) => {
		setInput(prompt);
	};

	const isLoading = status === "streaming" || status === "submitted";

	const handleStartNewChat = () => {
		setHasStartedChat(false);
		setInput("");
		setPricingConfig(null);
	};

	return (
		<SidebarContext.Provider value={{ expanded: true, setExpanded: () => {} }}>
			<div className="w-full h-full flex flex-col bg-background">
				{/* Main content */}
				<div className="flex-1 flex min-h-0 relative">
					<AnimatePresence mode="wait">
						{!hasStartedChat ? (
							/* Welcome State - Centered */
							<motion.div
								key="welcome"
								initial={{ opacity: 1 }}
								exit={{ opacity: 0 }}
								transition={{ duration: 0.3 }}
								className="absolute inset-0 flex flex-col items-center justify-center px-6"
							>
								{/* Glow layer behind leaf */}
								<motion.div
									initial={{ opacity: 0 }}
									animate={{ opacity: [0, 0.6, 0] }}
									transition={{
										duration: 4,
										repeat: Infinity,
										ease: "easeOut",
									}}
									className="absolute inset-0 pointer-events-none overflow-hidden"
									style={{
										backgroundImage: "url(/autumn-leaf.png)",
										backgroundRepeat: "no-repeat",
										backgroundPosition: "85% 60%",
										backgroundSize: "30%",
										filter: "blur(50px) brightness(1)",
									}}
								/>
								{/* Main leaf */}
								<motion.div
									initial={{ opacity: 0 }}
									animate={{ opacity: 0.45 }}
									transition={{ duration: 1, ease: "easeOut" }}
									className="absolute inset-0 pointer-events-none overflow-hidden"
									style={{
										backgroundImage: "url(/autumn-leaf.png)",
										backgroundRepeat: "no-repeat",
										backgroundPosition: "85% 60%",
										backgroundSize: "30%",
										maskImage:
											"radial-gradient(ellipse 70% 80% at 85% 60%, black 0%, transparent 70%)",
										WebkitMaskImage:
											"radial-gradient(ellipse 70% 80% at 85% 60%, black 0%, transparent 70%)",
									}}
								/>

								{/* Org dropdown in top left */}
								<div className="absolute top-4 left-4">
									<OrgDropdown />
								</div>

								<WelcomeHeader />

								<div className="w-full max-w-2xl">
									<PromptInput
										onSubmit={handleSubmit}
										accept="image/*"
										multiple
									>
										<AttachmentsHeader />
										<PromptInputBody>
											<PromptInputTextarea
												value={input}
												onChange={(e) => setInput(e.target.value)}
												placeholder="My app has a free and a pro plan with..."
												disabled={isLoading}
											/>
										</PromptInputBody>
										<PromptInputFooter className="justify-between">
											<ImageUploadButton disabled={isLoading} />
											<PromptInputSubmit disabled={isLoading} />
										</PromptInputFooter>
									</PromptInput>
								</div>

								<motion.div
									initial={{ opacity: 0, y: 20 }}
									animate={{ opacity: 1, y: 0 }}
									transition={{ duration: 0.4, ease: "easeOut", delay: 0.1 }}
									className="flex flex-col items-center mt-3 w-full max-w-2xl"
								>
									<TemplatePrompts onSelectTemplate={handleSelectTemplate} />
									<Button
										variant="skeleton"
										type="button"
										onClick={onBack}
										className=" text-xs! text-t4"
									>
										or skip to dashboard
									</Button>
								</motion.div>
							</motion.div>
						) : (
							/* Chat State - Split View */
							<motion.div
								key="chat"
								initial={{ opacity: 0 }}
								animate={{ opacity: 1 }}
								transition={{ duration: 0.3, delay: 0.2 }}
								className="flex w-full h-full relative"
							>
								{/* Org dropdown in top left */}
								<div className="absolute top-4 left-4 z-10">
									<OrgDropdown />
								</div>

								{/* Left: Chat */}
								<motion.div
									initial={{ x: -50, opacity: 0 }}
									animate={{ x: 0, opacity: 1 }}
									transition={{ duration: 0.4, delay: 0.3 }}
									className="w-1/3 flex flex-col pt-14"
								>
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
																						{toolPart.input?.products.length ??
																							0}{" "}
																						product(s) and{" "}
																						{toolPart.input?.features.length ??
																							0}{" "}
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
										</ConversationContent>
									</Conversation>

									<div className="px-6 pb-6 pt-2">
										<PromptInput
											onSubmit={handleSubmit}
											accept="image/*"
											multiple
										>
											<AttachmentsHeader />
											<PromptInputBody>
												<PromptInputTextarea
													value={input}
													onChange={(e) => setInput(e.target.value)}
													placeholder="Describe your app's pricing"
													disabled={isLoading}
												/>
											</PromptInputBody>
											<PromptInputFooter className="justify-between">
												<ImageUploadButton disabled={isLoading} />
												<PromptInputSubmit
													disabled={isLoading}
													variant="primary"
												/>
											</PromptInputFooter>
										</PromptInput>
									</div>
								</motion.div>

								{/* Right: Pricing Preview */}
								<motion.div
									initial={{ x: 100, opacity: 0 }}
									animate={{ x: 0, opacity: 1 }}
									transition={{ duration: 0.4, delay: 0.4 }}
									className="w-2/3 flex flex-col pt-14 px-6 pb-6"
								>
									<PricingPreview
										config={pricingConfig}
										previewOrg={previewOrg}
										isSyncing={isPreviewSyncing}
										headerActions={
											pricingConfig &&
											pricingConfig.products.length > 0 && (
												<>
													<Button
														variant="secondary"
														size="sm"
														onClick={handleStartNewChat}
													>
														New chat
													</Button>
													<CopyPlansButton pricingConfig={pricingConfig} />
												</>
											)
										}
									/>
								</motion.div>
							</motion.div>
						)}
					</AnimatePresence>
				</div>

				<PricingConfigSheet
					open={jsonSheetConfig !== null}
					onOpenChange={(open) => !open && setJsonSheetConfig(null)}
					config={jsonSheetConfig}
				/>
			</div>
		</SidebarContext.Provider>
	);
}
