import { redirect } from "next/navigation";
import AppShell from "@/components/AppShell";
import { PrivacyProvider } from "@/components/Preferences";
import { ProfileProvider } from "@/components/ProfileProvider";
import { createClient } from "@/lib/supabase/server";
import type { Profile } from "@/lib/types";

export const dynamic = "force-dynamic";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data } = await supabase.from("profiles").select("*").eq("id", user.id).maybeSingle();
  const profile: Profile = data ?? {
    id: user.id, email: user.email ?? null, full_name: user.email ?? null, role: "student", student_group_id: null,
  };

  return (
    <ProfileProvider profile={profile}>
      <PrivacyProvider>
        <AppShell profile={profile}>{children}</AppShell>
      </PrivacyProvider>
    </ProfileProvider>
  );
}
