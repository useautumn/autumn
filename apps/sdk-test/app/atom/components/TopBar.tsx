import { Button, cn, Input } from "@autumn/ui";
import { useState } from "react";
import type { PlaygroundSettings, Scope } from "../settings";
import { ConnectionFields } from "./ConnectionFields";
import { GearIcon } from "./GearIcon";
import { OptionToggle } from "./OptionToggle";

const SCOPES: ReadonlyArray<Scope> = ["customer", "entity"];

export const TopBar = ({
  settings,
  onChange,
}: {
  settings: PlaygroundSettings;
  onChange: (patch: Partial<PlaygroundSettings>) => void;
}) => {
  const [open, setOpen] = useState(false);
  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center gap-2">
        <p className="mr-auto text-main">Atom</p>
        <Input
          aria-label="Customer ID"
          className="h-7 w-28"
          placeholder="customer"
          value={settings.customerId}
          onChange={(e) => onChange({ customerId: e.target.value })}
        />
        <Input
          aria-label="Feature ID"
          className="h-7 w-28"
          placeholder="feature"
          value={settings.featureId}
          onChange={(e) => onChange({ featureId: e.target.value })}
        />
        <OptionToggle
          value={settings.scope}
          options={SCOPES}
          onChange={(scope) => onChange({ scope })}
        />
        <Input
          aria-label="Entity ID"
          className="h-7 w-24"
          placeholder="entity ID"
          disabled={settings.scope !== "entity"}
          value={settings.entityId}
          onChange={(e) => onChange({ entityId: e.target.value })}
        />
        <Button
          variant="secondary"
          size="icon"
          aria-label="Connection"
          className={cn("size-7", open && "border-primary")}
          onClick={() => setOpen((v) => !v)}
        >
          <GearIcon />
        </Button>
      </div>
      {open && <ConnectionFields settings={settings} onChange={onChange} />}
    </div>
  );
};
