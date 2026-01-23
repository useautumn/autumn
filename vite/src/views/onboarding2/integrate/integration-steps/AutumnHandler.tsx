import CodeBlock from "@/views/onboarding/components/CodeBlock";
import { CodeSpan } from "../components/CodeSpan";
import { useIntegrateContext } from "../IntegrateContext";
import { Backend } from "../StackEnums";
import { StepHeader } from "../StepHeader";
import {} from "./handlerSnippets";
import {
	elysiaBetterAuth,
	elysiaClerk,
	elysiaOther,
} from "./snippets/elysiaHandler";
import {
	expressBetterAuth,
	expressClerk,
	expressOther,
	expressSupabase,
} from "./snippets/expressHandler";
import { general } from "./snippets/general";
import {
	honoBetterAuth,
	honoClerk,
	honoOther,
	honoSupabase,
} from "./snippets/honoHandler";
import {
	nextjsBetterAuthOrg,
	nextjsBetterAuthUser,
	nextjsClerkOrg,
	nextjsClerkUser,
	nextjsOther,
	nextjsSupabaseOrg,
	nextjsSupabaseUser,
} from "./snippets/nextjsHandler";
import {
	rr7BetterAuth,
	rr7Clerk,
	rr7Other,
	rr7Supabase,
} from "./snippets/rr7Handler";

const snippet = () => {
	return {
		[Backend.Nextjs]: {
			["better_auth"]: {
				user: nextjsBetterAuthUser,
				org: nextjsBetterAuthOrg,
			},
			["supabase"]: {
				user: nextjsSupabaseUser,
				org: nextjsSupabaseOrg,
			},
			["clerk"]: {
				user: nextjsClerkUser,
				org: nextjsClerkOrg,
			},
			["other"]: {
				user: nextjsOther,
				org: nextjsOther,
			},
		},
		[Backend.ReactRouter]: {
			["better_auth"]: {
				user: rr7BetterAuth("user"),
				org: rr7BetterAuth("org"),
			},
			["supabase"]: {
				user: rr7Supabase("user"),
				org: rr7Supabase("org"),
			},
			["clerk"]: {
				user: rr7Clerk("user"),
				org: rr7Clerk("org"),
			},
			["other"]: {
				user: rr7Other("user"),
				org: rr7Other("org"),
			},
		},
		[Backend.Hono]: {
			["clerk"]: {
				user: honoClerk("user"),
				org: honoClerk("org"),
			},
			["supabase"]: {
				user: honoSupabase("user"),
				org: honoSupabase("org"),
			},
			["better_auth"]: {
				user: honoBetterAuth("user"),
				org: honoBetterAuth("org"),
			},
			["other"]: {
				user: honoOther("user"),
				org: honoOther("org"),
			},
		},
		[Backend.Express]: {
			["better_auth"]: {
				user: expressBetterAuth("user"),
				org: expressBetterAuth("org"),
			},
			["clerk"]: {
				user: expressClerk("user"),
				org: expressClerk("org"),
			},
			["supabase"]: {
				user: expressSupabase("user"),
				org: expressSupabase("org"),
			},
			["other"]: {
				user: expressOther("user"),
				org: expressOther("org"),
			},
		},
		[Backend.Elysia]: {
			["better_auth"]: {
				user: elysiaBetterAuth("user"),
				org: elysiaBetterAuth("org"),
			},
			["clerk"]: {
				user: elysiaClerk("user"),
				org: elysiaClerk("org"),
			},
			["other"]: {
				user: elysiaOther("user"),
				org: elysiaOther("org"),
			},
		},
	} as any;
};

export const AutumnHandler = () => {
	const { queryStates } = useIntegrateContext();

	const getSnippetContent = () => {
		const backendLang = queryStates.backend;
		const authProvider = queryStates.auth;
		const customerType = queryStates.customerType;

		const templates = snippet();

		let template = templates[backendLang]?.[authProvider]?.[customerType] || "";

		template = template.trim("\n");

		if (!template) {
			return general();
		}

		return template;
	};

	return (
		<div className="flex flex-col gap-4 w-full">
			<StepHeader
				number={4}
				title={
					<p>
						Mount <CodeSpan>autumnHandler</CodeSpan> to your backend
					</p>
				}
			/>
			<p className="text-t2 text-sm">
				<CodeSpan>autumnHandler</CodeSpan> mounts routes on the{" "}
				<CodeSpan>/api/autumn/*</CodeSpan> paths which allows our React hooks
				and components to interact with the Autumn API directly.
			</p>

			<CodeBlock
				snippets={[
					{
						title: "Backend",
						language: "typescript",
						displayLanguage: "typescript",
						content: getSnippetContent(),
					},
				]}
			/>
		</div>
	);
};
