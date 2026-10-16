import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useState } from "react";
import { ActionPanel } from "./components/ActionPanel";
import { BalanceHero } from "./components/BalanceHero";
import { HistoryList } from "./components/HistoryList";
import { LocksList } from "./components/LocksList";
import { TopBar } from "./components/TopBar";
import { useAtomRunner } from "./hooks/useAtomRunner";
import { useBalance } from "./hooks/useBalance";
import { useDarkOnRoot } from "./hooks/useDarkOnRoot";
import { useLocks } from "./hooks/useLocks";
import { useSettings } from "./hooks/useSettings";

const Playground = () => {
  const { settings, updateSettings } = useSettings();
  const balance = useBalance({ settings });
  const runner = useAtomRunner({ settings });
  const locks = useLocks({ run: runner.run, customerId: settings.customerId });

  return (
    <div className="mx-auto flex max-w-[720px] flex-col gap-3 px-4 py-8">
      <TopBar settings={settings} onChange={updateSettings} />
      <div className="sticky top-3 z-20">
        <BalanceHero
          balance={balance.data}
          refreshing={balance.isFetching}
          onRefresh={() => balance.refetch()}
          last={runner.history[0]}
        />
      </div>
      <ActionPanel runner={runner} onLocked={locks.add} />
      <LocksList locks={locks.locks} onFinalize={locks.finalize} onClear={locks.clearSettled} />
      <HistoryList
        entries={runner.history}
        onClear={runner.clear}
        onRestoreLock={locks.add}
      />
    </div>
  );
};

export default function AtomPlayground() {
  useDarkOnRoot();
  const [queryClient] = useState(() => new QueryClient());
  return (
    <QueryClientProvider client={queryClient}>
      <div
        className="min-h-screen bg-background text-foreground"
        style={{ fontFamily: '"Inter", "Inter Fallback", sans-serif' }}
      >
        <Playground />
      </div>
    </QueryClientProvider>
  );
}
