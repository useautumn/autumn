import { AtIcon, UserCircleIcon } from "@phosphor-icons/react";
import type { ReactNode } from "react";
import StackBadge from "@/components/v2/badges/StackBadge";
import {
	type AuthType,
	type CustomerType,
	type StackType,
	useIntegrationContext,
} from "./IntegrationContext";
import { SectionHeader } from "./SectionHeader";

type StackOption =
	| {
			value: string;
			label: string;
			asset: string;
			icon?: never;
	  }
	| {
			value: string;
			label: string;
			asset?: never;
			icon: ReactNode;
	  };

const FRONTEND_OPTIONS: StackOption[] = [
	{ value: "nextjs", label: "Next.js", asset: "/frameworks/nextjs.png" },
	{ value: "rr7", label: "RR7", asset: "/frameworks/react-router.svg" },
	{ value: "vite", label: "Vite SPA", asset: "/frameworks/vite.svg" },
	{ value: "general", label: "Other", asset: "/frameworks/react.png" },
];

const BACKEND_OPTIONS: StackOption[] = [
	{
		value: "nextjs",
		label: "Next.js",
		asset: "/frameworks/nextjs.png",
	},
	{ value: "rr7", label: "RR7", asset: "/frameworks/react-router.svg" },
	{ value: "hono", label: "Hono", asset: "/frameworks/hono.png" },
	{ value: "express", label: "Express", asset: "/frameworks/express.png" },
	{ value: "elysia", label: "Elysia", asset: "/frameworks/elysia.png" },
	{ value: "general", label: "Other", asset: "/frameworks/react.png" },
];

const AUTH_OPTIONS: StackOption[] = [
	{
		value: "betterauth",
		label: "Better Auth",
		asset: "/frameworks/better-auth.png",
	},
	{ value: "supabase", label: "Supabase", asset: "/frameworks/supabase.png" },
	{ value: "clerk", label: "Clerk", asset: "/frameworks/clerk.png" },
	{ value: "other", label: "Other", asset: "/frameworks/react.png" },
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

export const StackSelectionSection = () => {
	const {
		selectedStack,
		setSelectedStack,
		selectedAuth,
		setSelectedAuth,
		customerType,
		setCustomerType,
	} = useIntegrationContext();

	return (
		<div className="flex flex-col gap-6">
			<SectionHeader
				stepNumber={1}
				title="Select your stack"
				description="Help us customize the integration guide for your specific tech stack. Click here if you're not using a React + Typescript backend stack."
			/>

			<div className="pl-[32px] flex flex-col gap-6">
				{/* Backend */}
				<div className="flex flex-col gap-2.5">
					<h3 className="text-sub-secondary text-[#444444]">Framework</h3>
					<div className="flex flex-row gap-2 flex-wrap">
						{BACKEND_OPTIONS.map((option) => (
							<StackBadge
								key={option.value}
								stack={option.label}
								asset={option.asset}
								isSelected={selectedStack === option.value}
								onSelectedChange={() =>
									setSelectedStack(option.value as StackType)
								}
							/>
						))}
					</div>
				</div>

				{/* Auth Provider */}
				<div className="flex flex-col gap-2.5">
					<h3 className="text-sub-secondary text-[#444444]">Auth Provider</h3>
					<div className="flex flex-row gap-2 flex-wrap">
						{AUTH_OPTIONS.map((option) => (
							<StackBadge
								key={option.value}
								stack={option.label}
								asset={option.asset}
								isSelected={selectedAuth === option.value}
								onSelectedChange={() =>
									setSelectedAuth(option.value as AuthType)
								}
							/>
						))}
					</div>
				</div>

				{/* Customer Type */}
				<div className="flex flex-col gap-2.5">
					<h3 className="text-sub-secondary text-[#444444]">Customer Type</h3>
					<div className="flex flex-row gap-2 flex-wrap">
						{CUSTOMER_TYPE_OPTIONS.map((option) => (
							<StackBadge
								key={option.value}
								stack={option.label}
								icon={option.icon}
								isSelected={customerType === option.value}
								onSelectedChange={() =>
									setCustomerType(option.value as CustomerType)
								}
							/>
						))}
					</div>
				</div>
			</div>
		</div>
	);
};
