import { ArrowUpRightFromSquare } from "lucide-react";
import CodeBlock from "../onboarding/components/CodeBlock";
import Step from "./Step";

const nextjs = () => {
	return `// app/layout.tsx
import { AutumnProvider } from "autumn-js/react";

export default function RootLayout({
  children,
}: {
  children: React.ReactNode,
}) {
  return (
    <html>
      <body>
        <AutumnProvider>
          {children}
        </AutumnProvider>
      </body>
    </html>
  );
}
`;
};
const vite = () => {
	return `// main.tsx
import { AutumnProvider } from "autumn-js/react";

createRoot(document.getElementById("root")!).render(
  // backendUrl is the URL of your server (eg. hono)
  <AutumnProvider backendUrl="http://localhost:8000">
    <App />
  </AutumnProvider>
);
`;
};
const reactRouter = () => {
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
        <AutumnProvider>
          {children}
        </AutumnProvider>
        <ScrollRestoration />
        <Scripts />
      </body>
    </html>
  );
}
`;
};

export default function AutumnProviderStep({ number }: { number: number }) {
	return (
		<Step
			title="Set up <AutumnProvider /> on the client side"
			number={number}
			description={
				<p>
					Wrap your root layout with the AutumnProvider component, and pass in
					your backend URL. Works with any React framework.
				</p>
			}
		>
			<CodeBlock
				snippets={[
					{
						title: "Next.js",
						language: "javascript",
						displayLanguage: "javascript",
						content: nextjs(),
					},
					{
						title: "Vite",
						language: "javascript",
						displayLanguage: "javascript",
						content: vite(),
					},
					{
						title: "React Router",
						language: "javascript",
						displayLanguage: "javascript",
						content: reactRouter(),
					},
				]}
			/>
		</Step>
	);
}
