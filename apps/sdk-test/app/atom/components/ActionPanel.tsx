import { Card, GroupedTabButton } from "@autumn/ui";
import { useState } from "react";
import type { AtomRunner } from "../hooks/useAtomRunner";
import type { HeldLock } from "../types";
import { BurstForm } from "./BurstForm";
import { CheckForm } from "./CheckForm";
import { LockForm } from "./LockForm";
import { TrackForm } from "./TrackForm";

const TABS = [
  { value: "check", label: "Check" },
  { value: "event", label: "Send event" },
  { value: "lock", label: "Lock" },
  { value: "track", label: "Track" },
  { value: "burst", label: "Burst" },
];

export const ActionPanel = ({
  runner,
  onLocked,
}: {
  runner: AtomRunner;
  onLocked: (lock: HeldLock) => void;
}) => {
  const [tab, setTab] = useState("check");
  return (
    <Card className="gap-4 p-4">
      <GroupedTabButton value={tab} onValueChange={setTab} options={TABS} />
      {tab === "check" && <CheckForm key="check" runner={runner} sendEvent={false} />}
      {tab === "event" && <CheckForm key="event" runner={runner} sendEvent />}
      {tab === "lock" && <LockForm runner={runner} onLocked={onLocked} />}
      {tab === "track" && <TrackForm runner={runner} />}
      {tab === "burst" && <BurstForm runner={runner} />}
    </Card>
  );
};
