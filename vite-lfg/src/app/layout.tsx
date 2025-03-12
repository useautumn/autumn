import { cn } from "@/lib/utils";
import { MainSidebar } from "@/views/new-sidebar/MainSidebar";

import { Outlet } from "react-router";

export function MainLayout() {
  return (
    <main className="w-screen h-screen flex">
      {/* {env === AppEnv.Sandbox && (
        <div className="w-full h-10 bg-primary/80 text-white text-sm flex items-center justify-center">
          <p className="font-medium">You&apos;re in sandbox mode.</p>
        </div>
      )} */}

      <MainSidebar />

      <div
        className={cn(
          "w-full h-full overflow-scroll bg-stone-50 p-6 flex justify-center"
          // env === AppEnv.Sandbox && "bg-slate-200"
        )}
      >
        <div className="hidden md:flex w-full h-fit max-w-[1048px] flex-col gap-4">
          <Outlet />
        </div>
        <div className="md:hidden w-full h-full flex items-center justify-center">
          <div className="bg-white p-6 rounded-lg shadow-sm text-center">
            <h2 className="text-xl font-semibold mb-2">
              Autumn is coming to mobile soon
            </h2>
            <p className="text-gray-600">
              We&apos;re currently designed for larger screens. Come back on
              your desktop?
            </p>
          </div>
        </div>
      </div>
    </main>
  );
}
