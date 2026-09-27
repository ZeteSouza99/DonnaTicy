import { notFound } from "next/navigation";
import { REQUIRE_DISCOUNT_APPROVAL } from "@/lib/features";

export default function AprovacoesLayout({
  children,
}: {
  children: React.ReactNode;
}): React.ReactNode {
  if (!REQUIRE_DISCOUNT_APPROVAL) notFound();
  return children;
}
