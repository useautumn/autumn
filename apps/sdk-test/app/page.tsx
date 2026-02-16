import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { scenarioSections } from "@/lib/scenarios";

export default function HomePage() {
  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-lg font-semibold tracking-tight">SDK Test App</h1>
        <p className="mt-1 text-sm text-zinc-500">
          Use the sidebar or cards below to switch between integration
          scenarios.
        </p>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        {scenarioSections.map((section) => (
          <Card key={section.id}>
            <CardHeader>
              <CardTitle>{section.title}</CardTitle>
              <CardDescription>
                {section.items.length} scenarios
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-2">
              {section.items.map((item) => (
                <Link
                  key={item.id}
                  href={item.href}
                  className="flex items-center justify-between rounded-md border border-zinc-200 px-3 py-2 text-sm hover:bg-zinc-50 dark:border-zinc-800 dark:hover:bg-zinc-900"
                >
                  <div>
                    <p className="font-medium">{item.title}</p>
                    <p className="text-xs text-zinc-500">{item.description}</p>
                  </div>
                  <Badge variant={item.status}>{item.status}</Badge>
                </Link>
              ))}
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
