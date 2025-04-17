import { sendEvent } from "@/app/autumn-functions";
import { entitled } from "@/app/autumn-functions";
import { MessageSquare } from "lucide-react";
import { toast } from "sonner";

export default function Application({
  customerId,
  fetchCustomer,
}: {
  customerId: string;
  fetchCustomer: () => void;
}) {

  const sendMessageClicked = async (featureId: string) => {
    const allowed = await entitled({
      customerId,
      featureId,
    });

    if (!allowed) {
      toast.error(`You're out of ${featureId}!`);
      return;
    }

    await sendEvent({
      customerId,
      featureId,
    });

    toast.success(`${featureId} used!`);
  };

  return (
    <div className="border rounded-lg bg-white overflow-hidden flex flex-col">
      <div className="border-b p-6">
        <div className="flex items-start justify-between">
          <div className="space-y-1">
            <h2 className="text-lg font-semibold">Feature Access Example</h2>
            <p className="text-sm text-muted-foreground">
              Test how our feature access and event sending works
            </p>
          </div>
          <div className="h-8 w-8 rounded-lg bg-purple-50 flex items-center justify-center">
            <MessageSquare className="h-4 w-4 text-purple-600" />
          </div>
        </div>
      </div>

      <div className="p-6 flex-1">
        <div className="space-y-2">
          <div className="text-sm font-medium">How it works:</div>
          <ol className="text-sm space-y-2 text-muted-foreground list-decimal list-inside">
            <li>First calls /entitled to check message allowance</li>
            <li>If allowed, calls /events to record the message</li>
            <li>Updates remaining message count</li>
          </ol>
        </div>
      </div>

      <div className="p-6 pt-0 flex gap-2">
        <button
          className="w-full bg-purple-600 hover:bg-purple-700 transition-colors"
          onClick={async () => {
            await sendMessageClicked("message-credits");
            await fetchCustomer();
          }}
        >
          Use Standard Message
        </button>

        <button
          className="w-full bg-purple-600 hover:bg-purple-700 transition-colors"
          onClick={async () => {
            await sendMessageClicked("premium-credits");
            await fetchCustomer();
          }}
        >
          Use Claude Message
        </button>
      </div>
    </div>
  );
}
