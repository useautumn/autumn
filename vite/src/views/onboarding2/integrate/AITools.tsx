import { StepHeader } from "./StepHeader";
import { Button } from "@/components/ui/button";
import CopyButton from "@/components/general/CopyButton";
import { ExternalLink, Download } from "lucide-react";
import { toast } from "sonner";

export const AITools = () => {
  // MCP configuration for Autumn
  const mcpConfig = {
    name: "autumn",
    command: "npx",
    args: ["-y", "mcp-remote", "https://docs.useautumn.com/mcp"],
  };

  // Base64 encode the configuration for Cursor's install URL
  const encodedConfig = btoa(JSON.stringify(mcpConfig));
  const cursorInstallUrl = `https://cursor.com/install-mcp?name=autumn&config=${encodedConfig}`;

  // Manual JSON configuration for copy-paste
  const manualConfig = JSON.stringify(
    {
      mcpServers: {
        autumn: mcpConfig,
      },
    },
    null,
    2
  );

  const handleCursorInstall = () => {
    window.open(cursorInstallUrl, "_blank");
  };

  return (
    <div className="flex flex-col gap-2">
      <StepHeader number={1} title="Add to AI tools" />
      <p className="text-sm text-t3">
        If you're using Cursor or Claude Code, you can install our MCP server to
        use AI to integrate Autumn.
      </p>

      {/* One-click install for Cursor */}
      <div className="flex gap-2">
        <Button
          onClick={handleCursorInstall}
          variant="outline"
          className="w-fit text-t2"
          startIcon={
            <img src="/cursor.png" className="w-4 h-4 mr-1" alt="Cursor" />
          }
        >
          Open in Cursor
        </Button>
        <Button
          onClick={() => {
            navigator.clipboard.writeText(
              "claude mcp add --transport http autumn-docs https://docs.useautumn.com/mcp"
            );
            toast.success(
              "Copied command to clipboard. Paste in your terminal to install."
            );
          }}
          variant="outline"
          className="w-fit text-t2"
          startIcon={
            <img src="/claude.png" className="w-4 h-4 mr-1" alt="Cursor" />
          }
        >
          Add to Claude Code
        </Button>
      </div>
    </div>
  );
};
