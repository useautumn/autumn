import Step from "@/components/general/OnboardingStep";
import CodeBlock from "../components/CodeBlock";
import { ArrowUpRightFromSquare } from "lucide-react";

let react = () => {
  return `import { AutumnProvider } from "autumn-js/react";

export default function RootLayout({
  children,
}: {
  children: React.ReactNode,
}) {
  return (
    <html>
      <body>
        <AutumnProvider backendUrl="http://localhost:8000">
          {children}
        </AutumnProvider>
      </body>
    </html>
  );
}
`;
};

export default function AutumnProvider({ number }: { number: number }) {
  return (
    <Step
      title="Set up <AutumnProvider />"
      number={number}
      description={
        <p>
          The{" "}
          <span className="font-mono text-red-500">
            <a
              href="https://docs.useautumn.com/api-reference/attach/post"
              target="_blank"
              rel="noopener noreferrer"
            >
              /attach
            </a>
            <ArrowUpRightFromSquare size={12} className="inline ml-1" />
          </span>{" "}
          endpoint will return a Stripe Checkout URL. Once paid, the user will
          be granted access to the features you defined above.
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
            title: "React",
            language: "javascript",
            displayLanguage: "javascript",
            content: react(),
          },
        ]}
      />
      {/* </div> */}
      {/* </div> */}
    </Step>
  );
}
