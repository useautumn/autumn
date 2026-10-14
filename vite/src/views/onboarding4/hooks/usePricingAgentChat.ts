import { useChat } from "@ai-sdk/react";
import type { AgentPricingConfig } from "@autumn/shared";
import type { PromptInputMessage } from "@autumn/ui/ai-elements";
import {
	DefaultChatTransport,
	lastAssistantMessageIsCompleteWithToolCalls,
} from "ai";
import { useCallback, useEffect, useId, useRef, useState } from "react";
import { useAxiosInstance } from "@/services/useAxiosInstance";
import type { PreviewOrg } from "../components/ChatInputComponents";

export interface UsePricingAgentChatOptions {
	initialConfig?: AgentPricingConfig | null;
}

export function usePricingAgentChat(options?: UsePricingAgentChatOptions) {
	const [input, setInput] = useState("");
	const [hasStartedChat, setHasStartedChat] = useState(
		options?.initialConfig != null,
	);
	const [pricingConfig, setPricingConfig] = useState<AgentPricingConfig | null>(
		options?.initialConfig ?? null,
	);
	const [jsonSheetConfig, setJsonSheetConfig] =
		useState<AgentPricingConfig | null>(null);
	const [previewOrg, setPreviewOrg] = useState<PreviewOrg | null>(null);
	const [isPreviewSyncing, setIsPreviewSyncing] = useState(false);
	const previewSetupRef = useRef<Promise<PreviewOrg | null> | null>(null);
	const syncInProgressRef = useRef(false);
	const initialSyncDoneRef = useRef(false);
	const axiosInstance = useAxiosInstance();

	const reactId = useId();
	const chatSessionIdRef = useRef(`pricing-chat-${reactId}-${Date.now()}`);

	const setupPreviewOrg = useCallback(async (): Promise<PreviewOrg | null> => {
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

	const syncPreviewPricing = useCallback(
		async (config: AgentPricingConfig) => {
			if (syncInProgressRef.current) {
				console.log("[Preview] Sync already in progress, skipping...");
				return;
			}

			let org = previewOrg;
			if (!org) {
				org = await setupPreviewOrg();
				if (!org) {
					console.error("[Preview] Cannot sync - preview org not available");
					return;
				}
			}

			syncInProgressRef.current = true;
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
				syncInProgressRef.current = false;
				setIsPreviewSyncing(false);
			}
		},
		[axiosInstance, previewOrg, setupPreviewOrg],
	);

	useEffect(() => {
		if (options?.initialConfig && !initialSyncDoneRef.current) {
			initialSyncDoneRef.current = true;
			setupPreviewOrg().then((org) => {
				if (org) {
					syncPreviewPricing(options.initialConfig as AgentPricingConfig);
				}
			});
		}
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, []);

	const { messages, sendMessage, status, addToolOutput, setMessages } = useChat(
		{
			transport: new DefaultChatTransport({
				api: `${import.meta.env.VITE_BACKEND_URL}/pricing-agent/chat`,
				credentials: "include",
				headers: {
					"x-client-type": "dashboard",
				},
				body: {
					sessionId: chatSessionIdRef.current,
					initialConfig: options?.initialConfig ?? null,
				},
			}),

			sendAutomaticallyWhen: lastAssistantMessageIsCompleteWithToolCalls,

			onToolCall: async ({ toolCall }) => {
				if (toolCall.dynamic) {
					return;
				}

				if (toolCall.toolName === "build_pricing") {
					const config = toolCall.input as AgentPricingConfig;

					setPricingConfig(config);

					syncPreviewPricing(config);

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
		},
	);

	const handleSubmit = useCallback(
		(message: PromptInputMessage) => {
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
		},
		[status, sendMessage],
	);

	const handleStartNewChat = useCallback(() => {
		setHasStartedChat(false);
		setInput("");
		setPricingConfig(null);
		setMessages([]);
	}, [setMessages]);

	const isLoading = status === "streaming" || status === "submitted";

	return {
		messages,
		input,
		setInput,
		status,
		isLoading,
		hasStartedChat,
		setHasStartedChat,

		pricingConfig,
		setPricingConfig,

		previewOrg,
		isPreviewSyncing,

		jsonSheetConfig,
		setJsonSheetConfig,

		handleSubmit,
		handleStartNewChat,
	};
}
