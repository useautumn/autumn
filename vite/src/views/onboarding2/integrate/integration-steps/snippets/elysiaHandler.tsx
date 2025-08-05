import { betterAuthSnippet } from "./betterAuth";

export const elysiaBetterAuth = (customerType: "user" | "org") => {
  return `import { autumnHandler } from "autumn-js/elysia";
import { auth } from "./auth";

const app = new Elysia()
  .use(cors())
  .mount(auth.handler)
  .use(
    autumnHandler({
      identify: async (context) => {
${betterAuthSnippet(customerType, "context.headers", 4)}
      },
    })
  )
  .listen(8000);
  
  `;
};

export const elysiaClerk = (customerType: "user" | "org") => {
  return `import { clerkPlugin } from "elysia-clerk";
import { autumnHandler } from "autumn-js/backend";

const app = new Elysia()
  .use(cors())
  .use(clerkPlugin())
  .all("*", async (ctx: any) => {
    console.log("Request received");
  })
  .all("/api/autumn/*", async (ctx: any) => {
    const auth = ctx.auth();

    let body = null;
    if (ctx.request.method !== "GET") {
      body = await ctx.request.json();
    }

    const { statusCode, response } = await autumnHandler({
      customerId: ${customerType === "user" ? "auth.userId" : "auth.orgId"},
      customerData: { name: "", email: "" },
      request: {
        url: ctx.request.url,
        method: ctx.request.method,
        body: body,
      },
    });

    ctx.set.status = statusCode;
    return response;
  })
  .listen(8000);`;
};

export const elysiaOther = (customerType: "user" | "org") => {
  return `import { autumnHandler } from "autumn-js/elysia";
import { auth } from "./auth";

const app = new Elysia()
  .use(cors())
  .mount(auth.handler)
  .use(
    autumnHandler({
      identify: async (context) => {
        const customerId = "your_customer_id"; // Authenticate and get customer ID from your DB

        return {
          customerId,
          customerData: { name: "", email: "" },
        };
      },
    })
  )
  .listen(8000);
  
  `;
};
