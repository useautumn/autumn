import { AnimatePresence, motion } from "motion/react";
import {
	PromptInput,
	PromptInputBody,
	PromptInputFooter,
	PromptInputSubmit,
	PromptInputTextarea,
} from "@/components/ai-elements/prompt-input";
import { Button } from "@/components/v2/buttons/Button";
import { OrgDropdown } from "@/views/main-sidebar/components/OrgDropdown";
import { SidebarContext } from "@/views/main-sidebar/SidebarContext";
import { CopyPlansButton } from "./CopyPlansButton";
import {
	AttachmentsHeader,
	ImageUploadButton,
} from "./components/ChatInputComponents";
import { PricingChatPanel } from "./components/PricingChatPanel";
import { TemplatePrompts } from "./components/TemplatePrompts";
import { WelcomeHeader } from "./components/WelcomeHeader";
import { usePricingAgentChat } from "./hooks/usePricingAgentChat";
import { PricingConfigSheet } from "./PricingConfigSheet";
import { PricingPreview } from "./PricingPreview";

interface AIChatViewProps {
	onBack: () => void;
}

export function AIChatView({ onBack }: AIChatViewProps) {
	const {
		messages,
		input,
		setInput,
		isLoading,
		hasStartedChat,
		pricingConfig,
		previewOrg,
		isPreviewSyncing,
		jsonSheetConfig,
		setJsonSheetConfig,
		handleSubmit,
		handleStartNewChat,
	} = usePricingAgentChat();

	const handleSelectTemplate = ({ prompt }: { prompt: string }) => {
		setInput(prompt);
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
									<PricingChatPanel
										messages={messages}
										input={input}
										onInputChange={setInput}
										onSubmit={handleSubmit}
										isLoading={isLoading}
										onViewJson={setJsonSheetConfig}
										placeholder="Describe your app's pricing"
										className="flex-1"
									/>
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
