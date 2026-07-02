import { buildTermsMarkdown } from "@/lib/agentContent";

export const dynamic = "force-static";

export function GET() {
  return new Response(buildTermsMarkdown(), {
    headers: { "Content-Type": "text/markdown; charset=utf-8" },
  });
}
