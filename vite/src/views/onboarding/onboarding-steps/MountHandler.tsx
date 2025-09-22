import Step from "@/components/general/OnboardingStep";
import CodeBlock from "../components/CodeBlock";
import { ArrowUpRightFromSquare } from "lucide-react";

let nextjs = () => {
	return `// app/api/autumn/[...all]/route.ts

import { autumnHandler } from "autumn-js/next";
import { auth } from "@/lib/auth";

export const { GET, POST } = autumnHandler({
  identify: async (request) => {
    const session = await auth.api.getSession({
      headers: request.headers,
    });

    return {
      customerId: session?.user.id,
      customerData: {
        name: session?.user.name,
        email: session?.user.email,
      },
    };
  },
});
`;
};

const remix = () => {
	return `// app/routes/api.autumn.$.ts

import { autumnHandler } from "autumn-js/remix";
import { auth } from "../lib/auth.server";

export const { loader, action } = autumnHandler({
  identify: async (args) => {
    const session = await auth.api.getSession({
      headers: args.request.headers,
    });

    return {
      customerId: session?.user.id,
      customerData: {
        name: session?.user.name,
        email: session?.user.email,
      },
    };
  },
});
`;
};

const Tanstack = () => {
	return `// routes/api/autumn.$.ts

import { createAPIFileRoute } from "@tanstack/react-start/api";
import { auth } from "~/lib/auth";
import { autumnHandler } from "autumn-js/tanstack";

const handler = autumnHandler({
  identify: async ({ request }) => {
    const session = await auth.api.getSession({
      headers: request.headers,
    });

    return {
      customerId: session?.user.id,
      customerData: {
        name: session?.user.name,
        email: session?.user.email,
      },
    };
  },
});

export const APIRoute = createAPIFileRoute("/api/autumn/$")(handler);
`;
};

const hono = () => {
	return `//index.ts

import { autumnHandler } from "autumn-js/hono";

app.use(
  "/api/autumn/*",
  autumnHandler({
    identify: async (c: Context) => {
      const session = await auth.api.getSession({
        headers: c.req.raw.headers,
      });

      return {
        customerId: session?.user.id,
        customerData: {
          name: session?.user.name,
          email: session?.user.email,
        },
      };
    },
  })
);
`;
};

const express = () => {
	return `//index.ts

import { autumnHandler } from "autumn-js/express";

app.use(express.json()); // need to parse request body before autumnHandler
app.use(
  "/api/autumn",
  autumnHandler({
    identify: async (req) => {
      const session = await auth.api.getSession({
        headers: fromNodeHeaders(req.headers),
      });

      return {
        customerId: session?.user.id,
        customerData: {
          name: session?.user.name,
          email: session?.user.email,
        },
      };
    },
  })
);
`;
};

const fastify = () => {
	return `//index.ts

import { autumnHandler } from "autumn-js/fastify";

fastify.route({
  method: ["GET", "POST"],
  url: "/api/autumn/*",
  handler: autumnHandler({
    identify: async (request) => {
      const session = await auth.api.getSession({
        headers: request.headers as any,
      });

      return {
        customerId: session?.user.id,
        customerData: {
          name: session?.user.name,
          email: session?.user.email,
        },
      };
    },
  }),
});
`;
};

export default function MountHandler({ number }: { number: number }) {
	return (
		<Step
			title="Mount the Autumn handler"
			number={number}
			description={
				<p>
					This creates routes in the /api/autumn/* path, used by Autumn&apos;s
					React library. The handler takes in an identify function that returns
					a customerId.
					<br />
					<br />
					This example shows the customerId being resolved from better-auth.
				</p>
			}
		>
			{/* <div className="flex gap-8 w-full justify-between flex-col lg:flex-row"> */}
			{/* <p>
            You can do this directly from your frontend using the Publishable
            API Key.
          </p> */}

			{/* <div className="w-full lg:w-2/3 min-w-md max-w-2xl"> */}
			<CodeBlock
				snippets={[
					{
						title: "Next.js",
						language: "typescript",
						displayLanguage: "typescript",
						content: nextjs(),
					},
					{
						title: "Remix",
						language: "typescript",
						displayLanguage: "typescript",
						content: remix(),
					},
					{
						title: "Tanstack",
						language: "typescript",
						displayLanguage: "typescript",
						content: Tanstack(),
					},
					{
						title: "Hono",
						language: "typescript",
						displayLanguage: "typescript",
						content: hono(),
					},
					{
						title: "Express",
						language: "typescript",
						displayLanguage: "typescript",
						content: express(),
					},
					{
						title: "Fastify",
						language: "typescript",
						displayLanguage: "typescript",
						content: fastify(),
					},
				]}
			/>
			{/* </div> */}
			{/* </div> */}
		</Step>
	);
}
