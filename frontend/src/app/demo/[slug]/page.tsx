import { createClient } from "@/utils/supabase/server";
import DemoView from "@/views/demo/DemoView";
import DynamicDemoView from "@/views/demo/DynamicDemo";
import MintDemoView from "@/views/demo/MintDemo";

export default async function DemoPage({
  params,
}: {
  params: { slug: string };
}) {
  // console.log(params);

  const sb = await createClient();
  const { data, error } = await sb
    .from("demo")
    .select("*")
    .eq("slug", params.slug)
    .single();

  if (error) {
    return <div>Not Found...</div>;
  }

  if (params.slug == "mint") {
    return (
      <MintDemoView
        publishableKey={data.publishable_key}
        secretKey={data.secret_key}
      />
    );
  }

  return <DynamicDemoView />;
}
