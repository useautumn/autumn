export const general = () => {
	return `import { autumnHandler } from "autumn-js/backend";

// 1. autumnHandler takes in request properties and returns a response
// 2. Simply mount the handler onto the /api/autumn/* path in your backend
// 3. Call autumnHandler and pass in the required parameters
// 4. Return the response from the autumnHandler

// Example using autumnHandler with Hono & Clerk
import { autumnHandler } from "autumn-js/backend";
import { clerkMiddleware, getAuth } from "@hono/clerk-auth";

app.use("*", clerkMiddleware());
app.use(
  "/api/autumn/*",
  async (c) => {
    const auth = getAuth(c);

    if (!auth?.userId) {
      return c.json({ message: "Unauthorized" }, 401);
    }

    let body = null;
    if (c.req.method !== "GET") {
      body = await c.req.json();
    }

    const { statusCode, response } = await autumnHandler({
      customerId: auth.userId,
      customerData: { name: "", email: "" },
      request: {
        url: c.req.url,
        method: c.req.method,
        body: body,
      },
    });

    return c.json(response, statusCode);
  }
);`;
};
