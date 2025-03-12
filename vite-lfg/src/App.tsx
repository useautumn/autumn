import { SignedIn, UserButton } from "@clerk/clerk-react";
import { SignedOut, SignInButton } from "@clerk/clerk-react";
import { cn } from "./lib/utils";

function App() {
  return (
    <main className="w-screen h-screen bg-blue-100 flex">
      {/* SIDEBAR */}
      <div className="h-full w-[200px] bg-blue-100"></div>

      <main className="flex flex-col w-full h-screen overflow-hidden">
        <div
          className={cn(
            "w-full h-full overflow-scroll bg-stone-50 p-6 flex justify-center"
          )}
        >
          <div className="hidden md:flex w-full h-fit max-w-[1048px] flex-col gap-4">
            {/* {children} */}
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
        {/* @ts-expect-error  this is a valid type */}
        <SignedOut>
          <SignInButton />
        </SignedOut>
        {/* @ts-expect-error  this is a valid type */}
        <SignedIn>
          <UserButton />
        </SignedIn>
      </main>
    </main>
  );
}

export default App;
