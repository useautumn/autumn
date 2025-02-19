import DemoView from "@/views/demo/DemoView";
import DynamicDemoView from "@/views/demo/DynamicDemo";

export default function DemoPage({ params }: { params: { slug: string } }) {
  // console.log(params);
  return <DynamicDemoView />;
}
