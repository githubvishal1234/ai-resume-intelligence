import { CapabilitiesCard } from "@/components/system/CapabilitiesCard";
import { Card, CardHeader } from "@/components/ui/Card";
import { useSession } from "@/hooks/useSession";

export function SettingsPage() {
  const user = useSession().data?.user;
  return (
    <div className="space-y-6">
      <h1 className="font-display text-headline-lg text-on-surface">Settings</h1>
      <div className="grid gap-6 lg:grid-cols-2">
        <Card aria-labelledby="account-title">
          <CardHeader id="account-title" title="Account" />
          <dl className="space-y-3">
            <div>
              <dt className="text-label-sm uppercase tracking-wide text-on-surface-variant">Name</dt>
              <dd className="text-body-lg text-on-surface">{user?.display_name}</dd>
            </div>
            <div>
              <dt className="text-label-sm uppercase tracking-wide text-on-surface-variant">Email</dt>
              <dd className="text-body-lg text-on-surface">{user?.email}</dd>
            </div>
          </dl>
        </Card>
        <CapabilitiesCard />
      </div>
    </div>
  );
}
