import { AtIcon, UserCircleIcon } from "@phosphor-icons/react";
import type { ReactNode } from "react";
import type { SDKType } from "@/hooks/stores/useSDKStore";
import type { AuthProvider, BackendStack, CustomerType } from "./types";

interface StackOption {
	value: string;
	label: string;
	asset?: string;
	icon?: ReactNode;
}

interface SDKOption {
	value: SDKType;
	label: string;
	icon: string;
}

const FRONTEND_OPTIONS: StackOption[] = [
	{ value: "nextjs", label: "Next.js", asset: "/frameworks/nextjs.png" },
	{ value: "rr7", label: "RR7", asset: "/frameworks/react-router.svg" },
	{ value: "vite", label: "Vite SPA", asset: "/frameworks/vite.svg" },
	{ value: "general", label: "Other", asset: "/frameworks/react.png" },
];

const BACKEND_OPTIONS: StackOption[] = [
	{ value: "nextjs", label: "Next.js", asset: "/frameworks/nextjs.png" },
	{ value: "rr7", label: "RR7", asset: "/frameworks/react-router.svg" },
	{ value: "hono", label: "Hono", asset: "/frameworks/hono.png" },
	{ value: "express", label: "Express", asset: "/frameworks/express.png" },
	{ value: "elysia", label: "Elysia", asset: "/frameworks/elysia.png" },
	{ value: "general", label: "Other", asset: "/frameworks/nodejs.svg" },
];

const AUTH_OPTIONS: StackOption[] = [
	{
		value: "betterauth",
		label: "Better Auth",
		asset: "/frameworks/better-auth.png",
	},
	{ value: "supabase", label: "Supabase", asset: "/frameworks/supabase.png" },
	{ value: "clerk", label: "Clerk", asset: "/frameworks/clerk.png" },
	{ value: "other", label: "Other", asset: "/auth-key.png" },
];

const CUSTOMER_TYPE_OPTIONS: StackOption[] = [
	{
		value: "user",
		label: "Users",
		icon: <UserCircleIcon size={16} color="var(--t7)" />,
	},
	{
		value: "org",
		label: "Orgs",
		icon: <AtIcon size={16} color="var(--t7)" />,
	},
];

export const SDK_OPTIONS: SDKOption[] = [
	{ value: "react", label: "React", icon: "/frameworks/react.png" },
	{ value: "node", label: "Node.js", icon: "/frameworks/nodejs.svg" },
	{ value: "python", label: "Python", icon: "/frameworks/python.png" },
	{ value: "curl", label: "cURL", icon: "/frameworks/curl.png" },
];

interface StackSection {
	label: string;
	configKey: "backend" | "auth" | "customerType";
	options: StackOption[];
}

export const STACK_SECTIONS: StackSection[] = [
	{ label: "Backend", configKey: "backend", options: BACKEND_OPTIONS },
	{ label: "Auth Provider", configKey: "auth", options: AUTH_OPTIONS },
	{
		label: "Customer Type",
		configKey: "customerType",
		options: CUSTOMER_TYPE_OPTIONS,
	},
];

;
