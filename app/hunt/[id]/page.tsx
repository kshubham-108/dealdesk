import { Arena } from "@/app/_components/Arena";

export default async function HuntPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <Arena mode="fixed" huntId={id} />;
}
