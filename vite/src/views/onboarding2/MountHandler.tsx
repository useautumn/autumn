import CodeBlock from "../onboarding/components/CodeBlock";
import Step from "./Step";

const nextjs = () => {
	return `// app/api/autumn/[...all]/route.ts

import { autumnHandler } from "autumn-js/next";
import { auth } from "@/lib/auth";

export const { GET, POST } = autumnHandler({
  identify: async (request) => {
    return {
      customerId: "demo_user_id", // your internal customer id
      customerData: {
        name: "John Doe",
        email: "john.doe@example.com",
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
    return {
      customerId: "demo_user_id", // your internal customer id
      customerData: {
        name: "John Doe",
        email: "john.doe@example.com",
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
    return {
      customerId: "demo_user_id", // your internal customer id
      customerData: {
        name: "John Doe",
        email: "john.doe@example.com",
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
      return {
        customerId: "demo_user_id", // your internal customer id
        customerData: {
          name: "John Doe",
          email: "john.doe@example.com",
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
      return {
        customerId: "demo_user_id", // your internal customer id
        customerData: {
          name: "John Doe",
          email: "john.doe@example.com",
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
      return {
        customerId: "demo_user_id", // your internal customer id
        customerData: {
          name: "John Doe",
          email: "john.doe@example.com",
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
			title="Mount the Autumn handler on your backend"
			number={number}
			description={
				<p>
					Mounts routes on the /api/autumn/* path which is used by Autumn&apos;s
					React library. Requires an identify function that returns the
					customerId for authentication.
				</p>
			}
		>
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
		</Step>
	);
}
