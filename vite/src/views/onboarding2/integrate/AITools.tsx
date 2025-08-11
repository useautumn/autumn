import { StepHeader } from "./StepHeader";
import { Button } from "@/components/ui/button";
import CopyButton from "@/components/general/CopyButton";
import { ExternalLink, Download, Info } from "lucide-react";
import { toast } from "sonner";
import {
  Accordion,
  AccordionTrigger,
  AccordionContent,
  AccordionItem,
} from "@/components/ui/accordion";
import FieldLabel from "@/components/general/modal-components/FieldLabel";
import CodeBlock from "@/views/onboarding/components/CodeBlock";
import { InfoBox } from "./components/InfoBox";
import { CodeSpan } from "./components/CodeSpan";

export const AITools = () => {
  // MCP configuration for Autumn
  const mcpConfig = {
    name: "Autumn Docs",
    url: "https://docs.useautumn.com/mcp",
    headers: {},
  };

  // Base64 encode the configuration for Cursor's install URL
  const encodedConfig = btoa(JSON.stringify(mcpConfig));
  const cursorInstallUrl = `cursor://anysphere.cursor-deeplink/mcp/install?name=Autumn%20Docs&config=${encodedConfig}`;

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
      {/* <StepHeader number={1} title="Add to AI tools" /> */}
      <Accordion
        type="single"
        collapsible
        className="w-full"
        // defaultValue="item-1"
      >
        <AccordionItem value="item-1" className="border">
          <AccordionTrigger className="bg-stone-100 p-2">
            <div className="flex items-center gap-2 text-t2">
              <Info size={14} />
              Add Autumn to your AI tools
            </div>
          </AccordionTrigger>
          <AccordionContent className="flex flex-col gap-4 text-t3 p-4 bg-white w-full">
            <p className="text-sm text-t2 w-full">
              Install our MCP with Cursor or Claude Code to use AI to integrate
              Autumn.
            </p>
            <div className="flex gap-6">
              <div>
                <FieldLabel>Cursor</FieldLabel>
                <Button
                  onClick={handleCursorInstall}
                  variant="outline"
                  className="w-fit text-t2"
                  startIcon={
                    <img
                      src="/cursor.png"
                      className="w-4 h-4 mr-1"
                      alt="Cursor"
                    />
                  }
                >
                  Open in Cursor
                </Button>
              </div>
              <div>
                <FieldLabel>Claude Code</FieldLabel>
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
                    <img
                      src="/claude.png"
                      className="w-4 h-4 mr-1"
                      alt="Cursor"
                    />
                  }
                >
                  Copy installation command
                </Button>
              </div>
            </div>
            <InfoBox>
              When using Cursor or Claude, prompt the model to use the
              `autumn-docs` MCP to integrate Autumn.
            </InfoBox>
          </AccordionContent>
        </AccordionItem>
      </Accordion>

      {/* One-click install for Cursor */}
      <div className="flex gap-2"></div>
    </div>
  );
};
