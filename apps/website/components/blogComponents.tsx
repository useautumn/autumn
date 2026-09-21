import Link from "next/link";
import type { ComponentPropsWithoutRef, ElementType, ReactNode } from "react";
import { CreditBucketsTable } from "./blogComponents/ai-billing-infrastructure/CreditBucketsTable";
import { CreditsTable } from "./blogComponents/ai-billing-infrastructure/CreditsTable";
import { LockAndReleaseDiagram } from "./blogComponents/ai-billing-infrastructure/LockAndReleaseDiagram";
import { AxiomLogLeakAnimation } from "./blogComponents/eliminating-memory-leaks/AxiomLogLeakAnimation";
import { CreditDrawdownDiagram } from "./blogComponents/how-firecrawl-runs-pricing-experiments-every-week/CreditDrawdownDiagram";
import { HierarchyDiagram } from "./blogComponents/how-mintlify-is-scaling-sales-led-gtm/HierarchyDiagram";
import { PlanRecordDiagram } from "./blogComponents/how-mintlify-is-scaling-sales-led-gtm/PlanRecordDiagram";
import { TestimonialQuote } from "./blogComponents/how-mintlify-is-scaling-sales-led-gtm/TestimonialQuote";
import { AgentEnvironmentDiagram } from "./blogComponents/inching-towards-a-software-factory/AgentEnvironmentDiagram";
import { BillingPathsAnimation } from "./blogComponents/inching-towards-a-software-factory/BillingPathsAnimation";
import { CloudAgentSession } from "./blogComponents/inching-towards-a-software-factory/CloudAgentSession";
import { ParallelTestPool } from "./blogComponents/inching-towards-a-software-factory/ParallelTestPool";
import { SetupActionVerifyTest } from "./blogComponents/inching-towards-a-software-factory/SetupActionVerifyTest";
import { AuthMdDiagram } from "./blogComponents/rebuilding-onboarding-for-agents/agentAuth/authMdDiagram";
import { AutumnKeylessDiagram } from "./blogComponents/rebuilding-onboarding-for-agents/agentAuth/autumnKeylessDiagram";
import { AgentDocsDiagram } from "./blogComponents/rebuilding-onboarding-for-agents/agentDocs/agentDocsDiagram";
import { AgentCatalogDiagram } from "./blogComponents/rebuilding-onboarding-for-agents/catalogWorkflow/agentCatalogDiagram";
import { CatalogSkillWorkflowDiagram } from "./blogComponents/rebuilding-onboarding-for-agents/catalogWorkflow/catalogSkillWorkflowDiagram";
import { CatalogTopupDiagram } from "./blogComponents/rebuilding-onboarding-for-agents/catalogWorkflow/catalogTopupDiagram";
import { CatalogUpdateModesDiagram } from "./blogComponents/rebuilding-onboarding-for-agents/catalogWorkflow/catalogUpdateModesDiagram";
import { DashboardCatalogDiagram } from "./blogComponents/rebuilding-onboarding-for-agents/catalogWorkflow/dashboardCatalogDiagram";
import { SharedCatalogApiDiagram } from "./blogComponents/rebuilding-onboarding-for-agents/catalogWorkflow/sharedCatalogApiDiagram";
import { EvalCodeExample } from "./blogComponents/rebuilding-onboarding-for-agents/evalConversation/evalCodeExample";
import { EvalConversation } from "./blogComponents/rebuilding-onboarding-for-agents/evalConversation/evalConversation";
import { OnboardingDiagram } from "./blogComponents/rebuilding-onboarding-for-agents/onboardingDiagram";
import { SetupWorkflowDiagram } from "./blogComponents/rebuilding-onboarding-for-agents/setupWorkflow/setupWorkflowDiagram";
import { ConfigAsCodeSimulator } from "./blogComponents/stop-rebuilding-your-billing-system/ConfigAsCodeSimulator";
import {
	ConfigSim,
	Toggle,
} from "./blogComponents/stop-rebuilding-your-billing-system/configSim";
import { HierarchyFlatSimulator } from "./blogComponents/stop-rebuilding-your-billing-system/HierarchyFlatSimulator";
import { HierarchyLayeredSimulator } from "./blogComponents/stop-rebuilding-your-billing-system/HierarchyLayeredSimulator";
import { PostgresTablesHero } from "./blogComponents/stop-rebuilding-your-billing-system/PostgresTablesHero";
import { RelationalDbSimulator } from "./blogComponents/stop-rebuilding-your-billing-system/RelationalDbSimulator";
import { StripeMappingDiagram } from "./blogComponents/stop-rebuilding-your-billing-system/StripeMappingDiagram";
import { StripeTransitionDiagram } from "./blogComponents/stop-rebuilding-your-billing-system/StripeTransitionDiagram";
import { Expand } from "./blogExpand";

function BlogHeading({
	as: Tag,
	children,
	...props
}: {
	as: ElementType;
	children?: ReactNode;
} & ComponentPropsWithoutRef<"h1">) {
	return (
		<Tag {...props} className="scroll-mt-24">
			{children}
		</Tag>
	);
}

export const mdxComponents = {
	h1: (props: ComponentPropsWithoutRef<"h1">) => (
		<BlogHeading as="h1" {...props} />
	),
	h2: (props: ComponentPropsWithoutRef<"h2">) => (
		<BlogHeading as="h2" {...props} />
	),
	h3: (props: ComponentPropsWithoutRef<"h3">) => (
		<BlogHeading as="h3" {...props} />
	),
	h4: (props: ComponentPropsWithoutRef<"h4">) => (
		<BlogHeading as="h4" {...props} />
	),
	a: ({ href, children, ...props }: ComponentPropsWithoutRef<"a">) => {
		const isExternal = href?.startsWith("http");
		if (isExternal) {
			return (
				<a
					href={href}
					target="_blank"
					rel="noopener noreferrer"
					className="font-normal text-[#9564ff] hover:text-[#b08aff] no-underline hover:underline decoration-[#9564ff]/60 decoration-1 underline-offset-4 transition-colors"
					{...props}
				>
					{children}
				</a>
			);
		}
		return (
			<Link
				href={href || "#"}
				className="font-normal text-[#9564ff] hover:text-[#b08aff] no-underline hover:underline decoration-[#9564ff]/60 decoration-1 underline-offset-4 transition-colors"
				{...props}
			>
				{children}
			</Link>
		);
	},
	pre: ({ children, ...props }: ComponentPropsWithoutRef<"pre">) => (
		<pre
			className="rounded-lg border border-[#292929] bg-[#141414] p-4 whitespace-pre-wrap break-words text-sm leading-relaxed [&>code]:rounded-none [&>code]:border-0 [&>code]:bg-transparent [&>code]:p-0"
			{...props}
		>
			{children}
		</pre>
	),
	code: ({ children, ...props }: ComponentPropsWithoutRef<"code">) => {
		const isInline = typeof children === "string";
		if (isInline && !props.className) {
			return (
				<code className="rounded bg-[#1c1c1c] border border-[#292929] px-1.5 py-0.5 text-[0.875em] text-[#e0e0e0] font-mono">
					{children}
				</code>
			);
		}
		return <code {...props}>{children}</code>;
	},
	blockquote: ({
		children,
		...props
	}: ComponentPropsWithoutRef<"blockquote">) => (
		<blockquote
			className="border-l-2 border-[#9564ff] bg-[#9564ff0d] py-4 pl-4 pr-4 not-italic font-normal text-[#FFFFFF99] [&>p]:my-0 [&>p]:text-[#FFFFFF99] [&>p+p]:mt-3 [&>p]:before:content-none [&>p]:after:content-none"
			{...props}
		>
			{children}
		</blockquote>
	),
	hr: (props: ComponentPropsWithoutRef<"hr">) => (
		<hr className="border-[#292929] my-8" {...props} />
	),
	table: ({ children, ...props }: ComponentPropsWithoutRef<"table">) => (
		<div className="overflow-x-auto my-6">
			<table className="w-full border-collapse text-sm" {...props}>
				{children}
			</table>
		</div>
	),
	th: ({ children, ...props }: ComponentPropsWithoutRef<"th">) => (
		<th
			className="border border-[#292929] bg-[#141414] px-4 py-2 text-left font-medium text-white"
			{...props}
		>
			{children}
		</th>
	),
	td: ({ children, ...props }: ComponentPropsWithoutRef<"td">) => (
		<td className="border border-[#292929] px-4 py-2" {...props}>
			{children}
		</td>
	),
	AxiomLogLeakAnimation,
	AgentEnvironmentDiagram,
	BillingPathsAnimation,
	Expand,
	CreditsTable,
	CreditBucketsTable,
	CreditDrawdownDiagram,
	LockAndReleaseDiagram,
	ConfigAsCodeSimulator,
	ConfigSim,
	HierarchyFlatSimulator,
	HierarchyDiagram,
	HierarchyLayeredSimulator,
	PlanRecordDiagram,
	CloudAgentSession,
	ParallelTestPool,
	OnboardingDiagram,
	DashboardCatalogDiagram,
	AgentCatalogDiagram,
	AgentDocsDiagram,
	AuthMdDiagram,
	AutumnKeylessDiagram,
	SetupWorkflowDiagram,
	SharedCatalogApiDiagram,
	CatalogUpdateModesDiagram,
	CatalogTopupDiagram,
	CatalogSkillWorkflowDiagram,
	EvalConversation,
	EvalCodeExample,
	SetupActionVerifyTest,
	TestimonialQuote,
	PostgresTablesHero,
	RelationalDbSimulator,
	StripeMappingDiagram,
	StripeTransitionDiagram,
	Toggle,
};
