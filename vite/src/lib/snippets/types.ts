import type { SDKType } from "@/hooks/stores/useSDKStore";

export type SnippetId =
	| "install"
	| "env-setup" // Add API key to env
	| "backend-setup" // React only, needs stack config
	| "add-provider" // React only
	| "create-customer"
	| "attach"
	| "attach-pricing-table" // React only - use PricingTable component
	| "attach-custom" // React only - build your own
	| "check"
	| "track";

export type FrontendStack = "nextjs" | "rr7" | "vite" | "general";
export type BackendStack =
	| "nextjs"
	| "express"
	| "hono"
	| "elysia"
	| "rr7"
	| "general";
export type AuthProvider = "betterauth" | "supabase" | "clerk" | "other";
export type CustomerType = "user" | "org";

export interface StackConfig {
	frontend: FrontendStack;
	backend: BackendStack;
	auth: AuthProvider;
	customerType: CustomerType;
}

export interface Snippet {
	id: SnippetId;
	title: string;
	description: string;
	filename: string;
	language: string;
	code: string;
}

export interface GetSnippetParams {
	id: SnippetId;
	sdk: SDKType;
	stackConfig?: StackConfig;
}

export type StepId = "customer" | "payments" | "usage";

export const STEP_SNIPPETS: Record<StepId, { react: SnippetId[]; other: SnippetId[]; curl: SnippetId[] }> = {
	customer: {
		react: ["install", "env-setup", "backend-setup", "add-provider", "create-customer"],
		other: ["install", "env-setup", "create-customer"],
		curl: ["env-setup", "create-customer"],
	},
	payments: {
		react: ["attach"],
		other: ["attach"],
		curl: ["attach"],
	},
	usage: {
		react: ["check", "track"],
		other: ["check", "track"],
		curl: ["check", "track"],
	},
};

export const DEFAULT_STACK_CONFIG: StackConfig = {
	frontend: "nextjs",
	backend: "nextjs",
	auth: "betterauth",
	customerType: "user",
};

