import { useRef, useState } from "react";
import { outcomeOf, servedByOf } from "@/lib/atom/callAtom";
import type { ServedBy } from "@/lib/atom/types";
import type { AtomRunner } from "./useAtomRunner";

export type BurstState = {
  total: number;
  times: Array<number>;
  allowed: number;
  denied: number;
  errors: number;
  servedBy: Partial<Record<ServedBy, number>>;
};

const emptyBurst = (total: number): BurstState => ({
  total,
  times: [],
  allowed: 0,
  denied: 0,
  errors: 0,
  servedBy: {},
});

export const useBurst = ({ runner }: { runner: AtomRunner }) => {
  const [burst, setBurst] = useState<BurstState | null>(null);
  const stopped = useRef(false);

  const start = async ({
    count,
    amount,
    sendEvent,
  }: {
    count: number;
    amount: number | undefined;
    sendEvent: boolean;
  }) => {
    stopped.current = false;
    let state = emptyBurst(count);
    setBurst(state);
    for (let n = 0; n < count && !stopped.current; n++) {
      const result = await runner.call({
        action: "check",
        params: { ...runner.base, requiredBalance: amount, sendEvent },
      });
      const { text } = outcomeOf({ result });
      const servedBy = servedByOf({ attempts: result.attempts });
      state = {
        ...state,
        times: [...state.times, result.ms],
        allowed: state.allowed + Number(text === "Allowed"),
        denied: state.denied + Number(text === "Denied"),
        errors: state.errors + Number(text.startsWith("Error")),
        servedBy: { ...state.servedBy, [servedBy]: (state.servedBy[servedBy] ?? 0) + 1 },
      };
      setBurst(state);
    }
    await runner.refresh();
  };

  return { burst, start, stop: () => (stopped.current = true) };
};
