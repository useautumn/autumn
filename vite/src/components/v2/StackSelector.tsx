import { AtIcon, UserCircleIcon } from "@phosphor-icons/react";
import type { ReactNode } from "react";
import StackBadge from "@/components/v2/badges/StackBadge";
import type {
	AuthProvider,
	BackendStack,
	CustomerType,
	StackConfig,
} from "@/lib/snippets/types";

interface StackOption {
	value: string;
	label: string;
	asset?: string;
	icon?: ReactNode;
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

interface StackSelectorProps {
	stackConfig: StackConfig;
	onStackConfigChange: (config: StackConfig) => void;
	className?: string;
}

export function StackSelector({
	stackConfig,
	onStackConfigChange,
	className,
}: StackSelectorProps) {
	return (
		<div className={className}>
			<div className="flex flex-col gap-4">
				{/* Backend */}
				<div className="flex flex-col gap-2">
					<h4 className="text-xs font-medium text-t3">Backend</h4>
					<div className="flex flex-row gap-1.5 flex-wrap">
						{BACKEND_OPTIONS.map((option) => (
							<StackBadge
								key={option.value}
								stack={option.label}
								asset={option.asset}
								isSelected={stackConfig.backend === option.value}
								onSelectedChange={() =>
									onStackConfigChange({
										...stackConfig,
										backend: option.value as BackendStack,
									})
								}
							/>
						))}
					</div>
				</div>
				{/* Auth Provider */}
				<div className="flex flex-col gap-2">
					<h4 className="text-xs font-medium text-t3">Auth Provider</h4>
					<div className="flex flex-row gap-1.5 flex-wrap">
						{AUTH_OPTIONS.map((option) => (
							<StackBadge
								key={option.value}
								stack={option.label}
								asset={option.asset}
								isSelected={stackConfig.auth === option.value}
								onSelectedChange={() =>
									onStackConfigChange({
										...stackConfig,
										auth: option.value as AuthProvider,
									})
								}
							/>
						))}
					</div>
				</div>
				{/* Customer Type */}
				<div className="flex flex-col gap-2">
					<h4 className="text-xs font-medium text-t3">Customer Type</h4>
					<div className="flex flex-row gap-1.5 flex-wrap">
						{CUSTOMER_TYPE_OPTIONS.map((option) => (
							<StackBadge
								key={option.value}
								stack={option.label}
								icon={option.icon}
								isSelected={stackConfig.customerType === option.value}
								onSelectedChange={() =>
									onStackConfigChange({
										...stackConfig,
										customerType: option.value as CustomerType,
									})
								}
							/>
						))}
					</div>
				</div>
			</div>
		</div>
	);
}
