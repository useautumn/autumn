import CodeBlock from "@/views/onboarding/components/CodeBlock";
import { CodeSpan } from "../components/CodeSpan";
import { StepHeader } from "../StepHeader";
import { useIntegrateContext } from "../IntegrateContext";
import { Backend, Frontend } from "../StackEnums";
import { InfoBox } from "../components/InfoBox";

const nextjsAutumnProvider = ({
	includeBackendUrl,
}: {
	includeBackendUrl: boolean;
}) => {
	const backendUrlStr = includeBackendUrl
		? ` backendUrl={process.env.NEXT_PUBLIC_BACKEND_URL}`
		: "";
	return `// layout.tsx
  
import { AutumnProvider, PricingTable } from "autumn-js/react";

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body>
        <AutumnProvider${backendUrlStr}>
          {children}
        </AutumnProvider>
      </body>
    </html>
  );
}`;
};

const rr7AutumnProvider = ({
	includeBackendUrl,
}: {
	includeBackendUrl: boolean;
}) => {
	const backendUrlStr = includeBackendUrl
		? ` backendUrl={import.meta.env.VITE_BACKEND_URL}`
		: "";
	return `// root.tsx

import { AutumnProvider } from "autumn-js/react";
export function Layout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <head>
        <meta charSet="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <Meta />
        <Links />
      </head>
      <body>
        <AutumnProvider${backendUrlStr}>{children}</AutumnProvider>
        <ScrollRestoration />
        <Scripts />
      </body>
    </html>
  );
}`;
};

const viteAutumnProvider = () => {
	return `// main.tsx
import { AutumnProvider } from "autumn-js/react";

createRoot(document.getElementById("root")!).render(
  <AutumnProvider backendUrl={import.meta.env.VITE_BACKEND_URL}>
    <App />
  </AutumnProvider>
);`;
};

const otherAutumnProvider = () => {
	return `// main.tsx
import { AutumnProvider } from "autumn-js/react";

// 1. Simply wrap the root of your app in the AutumnProvider component
// 2. Pass in your server's URL to the backendUrl prop

createRoot(document.getElementById("root")!).render(
  <Layout>
    <AutumnProvider backendUrl={import.meta.env.VITE_BACKEND_URL}>
      <App />
    </AutumnProvider>
  </Layout>
);`;
};

const getSnippet = (queryStates: any) => {
	const { backend, frontend } = queryStates;
	if (frontend === Frontend.Nextjs) {
		return nextjsAutumnProvider({
			includeBackendUrl: backend !== Backend.Nextjs,
		});
	} else if (frontend === Frontend.ReactRouter) {
		return rr7AutumnProvider({
			includeBackendUrl: backend === Backend.Nextjs,
		});
	} else if (frontend === Frontend.Vite) {
		return viteAutumnProvider();
	} else {
		return otherAutumnProvider();
	}
};

export const AddAutumnProvider = () => {
	const { queryStates } = useIntegrateContext();
	return (
		<div className="flex flex-col gap-4 w-full">
			<StepHeader
				number={5}
				title={
					<p>
						Wrap your React app in <CodeSpan>{"<AutumnProvider />"}</CodeSpan>
					</p>
				}
			/>
			<p className="text-t2 text-sm">
				This allows you to use our React hooks and components in your app. If
				your server URL is different to your client, you will need to pass in
				the backend URL as a prop.
			</p>
			<CodeBlock
				snippets={[
					{
						title: "React App",
						language: "javascript",
						displayLanguage: "javascript",
						content: getSnippet(queryStates),
					},
				]}
			/>
			{queryStates.auth === "supabase" && (
				<InfoBox classNames={{ infoIcon: "!pt-1.5" }}>
					<p className="text-t2 text-sm leading-5">
						The examples above assume that Supabase auth is implemented using
						server-side cookie authentication, following the guide{" "}
						<a
							className="text-t2 font-medium underline"
							href="https://supabase.com/docs/guides/auth/server-side/creating-a-client"
							target="_blank"
						>
							here
						</a>
						.
						<br />
						<br />
						If you need to set <CodeSpan>{"Bearer <auth_token>"}</CodeSpan> in
						your request headers to authenticate, you can use the{" "}
						<CodeSpan>getBearerToken</CodeSpan> prop in the{" "}
						<CodeSpan>AutumnProvider</CodeSpan> component.
					</p>
				</InfoBox>
			)}
		</div>
	);
};
