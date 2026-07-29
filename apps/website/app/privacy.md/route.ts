import { buildPrivacyMarkdown } from "@/lib/agentContent";

export const dynamic = "force-static";

export function GET() {
  return new Response(buildPrivacyMarkdown(), {
    headers: { "Content-Type": "text/markdown; charset=utf-8" },
  });
}
