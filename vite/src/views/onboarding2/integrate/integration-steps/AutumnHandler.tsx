import CodeBlock from "@/views/onboarding/components/CodeBlock";
import { StepHeader } from "../StepHeader";
import { useIntegrateContext } from "../IntegrateContext";

import {} from "./handlerSnippets";
import {
  nextjsBetterAuthOrg,
  nextjsBetterAuthUser,
  nextjsClerkOrg,
  nextjsClerkUser,
  nextjsOther,
  nextjsSupabaseOrg,
  nextjsSupabaseUser,
} from "./snippets/nextjsHandler";
import { rr7BetterAuth, rr7Clerk, rr7Supabase } from "./snippets/rr7Handler";
import {
  honoBetterAuth,
  honoClerk,
  honoSupabase,
} from "./snippets/honoHandler";
import {
  expressBetterAuth,
  expressClerk,
  expressSupabase,
} from "./snippets/expressHandler";
import { elysiaBetterAuth } from "./snippets/elysiaHandler";

const snippet = () => {
  return {
    nextjs: {
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
    ["react_router"]: {
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
    },
    ["hono"]: {
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
    },
    ["express"]: {
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
    },
    ["elysia"]: {
      ["better_auth"]: {
        user: elysiaBetterAuth("user"),
        org: elysiaBetterAuth("org"),
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

    console.log("Backend Lang", backendLang);
    console.log("Auth Provider", authProvider);

    const template =
      templates[backendLang]?.[authProvider]?.[customerType] || "";

    console.log("Template", template);

    // Trim \n from the template (only left and right)
    return template.trim("\n");
  };

  return (
    <div className="flex flex-col gap-2 w-full">
      <StepHeader number={3} title="Install autumn-js" />

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
