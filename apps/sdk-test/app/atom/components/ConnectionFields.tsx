import { Card, Input, Switch } from "@autumn/ui";
import type { PlaygroundSettings } from "../settings";

export const ConnectionFields = ({
  settings,
  onChange,
}: {
  settings: PlaygroundSettings;
  onChange: (patch: Partial<PlaygroundSettings>) => void;
}) => (
  <Card className="gap-2 p-3">
    <Input
      aria-label="Edge URL"
      placeholder="Edge URL"
      value={settings.edgeURL}
      onChange={(e) => onChange({ edgeURL: e.target.value })}
    />
    <div className="grid grid-cols-2 gap-2">
      <Input
        aria-label="Server URL"
        placeholder="Server URL (default)"
        value={settings.serverURL}
        onChange={(e) => onChange({ serverURL: e.target.value })}
      />
      <Input
        aria-label="Secret key"
        type="password"
        placeholder="Secret key (.env.local)"
        value={settings.secretKey}
        onChange={(e) => onChange({ secretKey: e.target.value })}
      />
    </div>
    <label className="flex cursor-pointer items-center justify-between text-xs text-tertiary-foreground">
      Use edge
      <Switch checked={settings.useEdge} onCheckedChange={(useEdge) => onChange({ useEdge })} />
    </label>
  </Card>
);
