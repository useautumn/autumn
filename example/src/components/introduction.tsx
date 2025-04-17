import Link from "next/link";

export default function Intro() {
  return (
    <div className="space-y-8">
      {/* Header Section */}
      <div className="space-y-2">
        <h1 className="text-3xl font-bold tracking-tight">
          Welcome to the Next.js Autumn template
        </h1>
        <p className="text-muted-foreground">
          Get started with Autumn by setting up your account and exploring the
          core features.
        </p>
      </div>

      {/* Setup Requirements */}
      <div className="p-6 border rounded-lg bg-stone-50 space-y-4">
        <h2 className="font-semibold">Before you get started</h2>
        <ul className="space-y-3 text-sm">
          <li className="flex items-center gap-2">
            <div className="h-2 w-2 rounded-full bg-stone-300" />
            <span>
              Create your Autumn secret key{" "}
              <Link
                href="https://app.useautumn.com/sandbox/dev"
                className="text-stone-700 underline underline-offset-4 hover:text-stone-900"
                target="_blank"
              >
                here
              </Link>{" "}
              and add it to the .env.local file
            </span>
          </li>
          <li className="flex items-center gap-2">
            <div className="h-2 w-2 rounded-full bg-stone-300" />
            <span>
              Connect your Stripe account{" "}
              <Link
                href="https://app.useautumn.com/sandbox/integrations/stripe"
                className="text-stone-700 underline underline-offset-4 hover:text-stone-900"
                target="_blank"
              >
                here
              </Link>
            </span>
          </li>
        </ul>
      </div>
    </div>
  );
}
