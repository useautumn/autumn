import { useQueryClient } from "@tanstack/react-query";
import { useRef, useState } from "react";
import { callAtom, netBalanceOf } from "@/lib/atom/callAtom";
import type { BalanceSnapshot } from "@/lib/atom/fetchBalanceSnapshot";
import type { AtomCall, AtomCallResult } from "@/lib/atom/types";
import { baseParamsOf, configOf, type PlaygroundSettings } from "../settings";
import type { LogEntry } from "../types";
import { balanceQueryKey } from "./useBalance";

export type RunAction = (args: { label: string; call: AtomCall }) => Promise<AtomCallResult>;

export type AtomRunner = ReturnType<typeof useAtomRunner>;

export const useAtomRunner = ({ settings }: { settings: PlaygroundSettings }) => {
  const queryClient = useQueryClient();
  const [history, setHistory] = useState<Array<LogEntry>>([]);
  const nextId = useRef(0);
  const queryKey = balanceQueryKey({ settings });
  const remainingNow = () =>
    queryClient.getQueryData<BalanceSnapshot>(queryKey)?.edge?.net ?? null;

  const call = (atomCall: AtomCall) =>
    callAtom({ request: { ...atomCall, config: configOf({ settings }) } });

  const run: RunAction = async ({ label, call: atomCall }) => {
    const before = remainingNow();
    const result = await call(atomCall);
    const id = nextId.current++;
    const entry = { id, at: Date.now(), label, result, before, after: netBalanceOf({ result }) };
    setHistory((prev) => [entry, ...prev].slice(0, 100));
    await queryClient.invalidateQueries({ queryKey });
    const after = remainingNow();
    if (entry.after === null && after !== null) {
      setHistory((prev) => prev.map((e) => (e.id === id ? { ...e, after } : e)));
    }
    return result;
  };

  const refresh = () => queryClient.invalidateQueries({ queryKey });

  return {
    base: baseParamsOf({ settings }),
    history,
    run,
    call,
    refresh,
    clear: () => setHistory([]),
  };
};
