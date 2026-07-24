import { getSession, getActiveMembership } from "@/lib/auth";
import { redirect } from "next/navigation";
import { AppShell } from "@/components/layout/app-shell";

export default async function Layout({ children }: { children: React.ReactNode }) {
  const session = await getSession();
  if (!session) redirect("/login");
  const membership = await getActiveMembership(session.userId);

  return (
    <AppShell
      householdName={membership?.household.name}
      userName={session.displayName}
      role={membership?.role}
    >
      {children}
    </AppShell>
  );
}
