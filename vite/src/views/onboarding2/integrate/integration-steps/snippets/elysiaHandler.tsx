import { betterAuthSnippet } from "./betterAuth";

export const elysiaBetterAuth = (customerType: "user" | "org") => {
  return `import { autumnHandler } from "autumn-js/elysia";
import { auth } from "./auth";

const app = new Elysia({ adapter: node() })
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

// export const elysiaOther = (customerType: "user" | "org") => {
//   return `

//   `;
// };
