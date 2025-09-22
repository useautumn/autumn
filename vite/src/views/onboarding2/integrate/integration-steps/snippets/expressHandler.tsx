import { betterAuthSnippet } from "./betterAuth";
import { clerkSnippet, supabaseSnippet } from "./honoHandler";

export const expressBetterAuth = (customerType: "user" | "org") => {
	return `import { autumnHandler } from "autumn-js/express";
import { auth } from "@/lib/auth";

app.use(express.json()); // need to parse request body before autumnHandler
app.use(
  "/api/autumn",
  autumnHandler({
    identify: async (req) => {
${betterAuthSnippet(customerType, "req.headers", 3)}
    },
  })
);`;
};

export const expressClerk = (customerType: "user" | "org") => {
	return `import { autumnHandler } from "autumn-js/express";
import { clerkMiddleware, getAuth } from "@clerk/express";

app.use(express.json()); // need to parse request body before autumnHandler
app.use(clerkMiddleware());
app.use(
  "/api/autumn",
  autumnHandler({
    identify: async (req) => {
      ${clerkSnippet(customerType, "req")}
    },
  })
);`;
};

export const expressSupabase = (customerType: "user" | "org") => {
	return `import { autumnHandler } from "autumn-js/express";
import { createClient } from "./lib/supabase";

app.use(express.json()); // need to parse request body before autumnHandler
app.use(
  "/api/autumn",
  autumnHandler({
    identify: async (req, res) => {
      ${supabaseSnippet(customerType, "createClient({ req, res })")}
    },
  })
);`;
};

export const expressOther = (customerType: "user" | "org") => {
	return `import { autumnHandler } from "autumn-js/express";

app.use(express.json()); // need to parse request body before autumnHandler
app.use(
  "/api/autumn",
  autumnHandler({
    identify: async (req, res) => {
      const customerId = "your_customer_id"; // Get customer id from your database

      return {
        customerId,
        customerData: { name: "", email: "" },
      };
    },
  })
);`;
};
