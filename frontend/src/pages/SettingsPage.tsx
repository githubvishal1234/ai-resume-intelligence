import { zodResolver } from "@hookform/resolvers/zod";
import { Trash2 } from "lucide-react";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { useNavigate } from "react-router-dom";
import { z } from "zod";
import { CapabilitiesCard } from "@/components/system/CapabilitiesCard";
import { Button, ButtonLink } from "@/components/ui/Button";
import { Card, CardHeader } from "@/components/ui/Card";
import { Field, Input } from "@/components/ui/Field";
import { Notice } from "@/components/ui/Notice";
import { Pill } from "@/components/ui/Pill";
import { ErrorState, PageLoading } from "@/components/ui/States";
import {
  useChangePassword,
  useDeleteAccount,
  useRevokeOtherSignIns,
  useRevokeSignIn,
  useSignIns,
  useUpdateProfile,
} from "@/hooks/useAccount";
import { useBilling, useCancelPro } from "@/hooks/useBilling";
import { useSession } from "@/hooks/useSession";
import { applyServerErrors } from "@/lib/formErrors";
import type { SignIn } from "@/services/accountService";
import { formatDate } from "@/pages/resumes/common";

export function SettingsPage() {
  return (
    <div className="space-y-6">
      <h1 className="font-display text-headline-lg text-on-surface">Settings</h1>
      <div className="grid gap-6 lg:grid-cols-2">
        <ProfileCard />
        <PlanCard />
        <PasswordCard />
        <SignInsCard />
        <CapabilitiesCard />
        <DeleteAccountCard />
      </div>
    </div>
  );
}

// ---- plan ------------------------------------------------------------------------------
/** Shown once payments are set up; before that, Pro is a waitlist on the pricing page. */
function PlanCard() {
  const billing = useBilling(true);
  const cancel = useCancelPro();
  const [confirming, setConfirming] = useState(false);
  const data = billing.data;
  if (!data?.configured) return null;
  const sub = data.subscription;
  const until = sub?.current_end ? formatDate(sub.current_end) : null;
  return (
    <Card aria-labelledby="plan-title">
      <CardHeader
        id="plan-title"
        title="Plan"
        action={<Pill tone={data.plan === "pro" ? "matched" : "neutral"}>{data.plan === "pro" ? "Pro" : "Free"}</Pill>}
      />
      {data.plan === "pro" && sub ? (
        <div className="space-y-4">
          <p className="text-body-md text-on-surface-variant">
            Pro, billed {sub.interval === "monthly" ? "monthly" : "yearly"}.{" "}
            {sub.cancel_at_period_end
              ? `Cancelled: Pro stays on${until ? ` until ${until}` : " until the end of this period"}, then you move to Free.`
              : until
                ? `Renews on ${until}.`
                : "Your first payment is being confirmed."}
          </p>
          {sub.status === "pending" ? (
            <Notice tone="warning" title="Your last payment didn't go through">
              Razorpay will try again. Pro stays on meanwhile.
            </Notice>
          ) : null}
          {sub.cancel_at_period_end ? null : confirming ? (
            <div className="flex flex-wrap items-center gap-2">
              <p className="text-body-md text-on-surface">Cancel Pro? You keep it until the period you paid for ends.</p>
              <Button variant="destructive" loading={cancel.isPending} onClick={() => cancel.mutate(undefined, { onSuccess: () => setConfirming(false) })}>
                Cancel Pro
              </Button>
              <Button variant="ghost" onClick={() => setConfirming(false)}>Keep Pro</Button>
            </div>
          ) : (
            <Button variant="secondary" onClick={() => setConfirming(true)}>Cancel Pro</Button>
          )}
          {cancel.error ? <p role="alert" className="text-body-sm text-critical">{cancel.error.message}</p> : null}
        </div>
      ) : (
        <div className="space-y-4">
          <p className="text-body-md text-on-surface-variant">
            Free plan: {data.ai_daily_limit} AI requests a day. Everything else is included.
          </p>
          <ButtonLink to="/pricing" variant="primary">Upgrade to Pro</ButtonLink>
        </div>
      )}
    </Card>
  );
}

// ---- profile ---------------------------------------------------------------------------
const profileSchema = z.object({
  display_name: z.string().trim().min(1, "Enter your name.").max(120, "Name is too long."),
});
type ProfileValues = z.infer<typeof profileSchema>;

function ProfileCard() {
  const user = useSession().data?.user;
  const update = useUpdateProfile();
  const [saved, setSaved] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const {
    register,
    handleSubmit,
    setError,
    formState: { errors, isDirty },
    reset,
  } = useForm<ProfileValues>({
    resolver: zodResolver(profileSchema),
    values: { display_name: user?.display_name ?? "" },
  });
  const onSubmit = handleSubmit(async (values) => {
    setFormError(null);
    setSaved(false);
    try {
      const next = await update.mutateAsync(values.display_name);
      reset({ display_name: next.display_name });
      setSaved(true);
    } catch (error) {
      setFormError(applyServerErrors(error, ["display_name"], setError));
    }
  });
  return (
    <Card aria-labelledby="account-title">
      <CardHeader id="account-title" title="Account" />
      {formError ? (
        <Notice tone="critical" title="Could not save" className="mb-4">
          {formError}
        </Notice>
      ) : null}
      <form noValidate onSubmit={onSubmit} className="space-y-4">
        <Field label="Name" error={errors.display_name?.message}>
          {({ id, describedBy, invalid }) => (
            <Input id={id} autoComplete="name" aria-describedby={describedBy} invalid={invalid} {...register("display_name")} />
          )}
        </Field>
        <div>
          <p className="text-label-md text-on-surface">Email</p>
          <p className="break-words text-body-lg text-on-surface">{user?.email}</p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <Button type="submit" variant="secondary" loading={update.isPending} disabled={!isDirty}>
            Save name
          </Button>
          {saved && !isDirty ? (
            <p role="status" className="text-body-sm text-on-surface-variant">
              Saved.
            </p>
          ) : null}
        </div>
      </form>
    </Card>
  );
}

// ---- password --------------------------------------------------------------------------
const passwordSchema = z
  .object({
    current_password: z.string().min(1, "Enter your current password."),
    new_password: z.string().min(1, "Enter a new password.").max(128, "Password is too long."),
    confirm: z.string(),
  })
  .refine((v) => v.new_password === v.confirm, { path: ["confirm"], message: "The passwords don't match." });
type PasswordValues = z.infer<typeof passwordSchema>;

function PasswordCard() {
  const change = useChangePassword();
  const [done, setDone] = useState<number | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const {
    register,
    handleSubmit,
    setError,
    reset,
    formState: { errors },
  } = useForm<PasswordValues>({
    resolver: zodResolver(passwordSchema),
    defaultValues: { current_password: "", new_password: "", confirm: "" },
  });
  const onSubmit = handleSubmit(async ({ current_password, new_password }) => {
    setFormError(null);
    setDone(null);
    try {
      const result = await change.mutateAsync({ current_password, new_password });
      reset();
      setDone(result.revoked);
    } catch (error) {
      setFormError(applyServerErrors(error, ["current_password", "new_password"], setError));
    }
  });
  return (
    <Card aria-labelledby="password-title">
      <CardHeader id="password-title" title="Password" description="Changing it signs you out everywhere else." />
      {formError ? (
        <Notice tone="critical" title="Could not change the password" className="mb-4">
          {formError}
        </Notice>
      ) : null}
      {done !== null ? (
        <Notice tone="success" title="Password changed" className="mb-4">
          {done === 0 ? "No other browsers were signed in." : `${done} other ${done === 1 ? "browser was" : "browsers were"} signed out.`}
        </Notice>
      ) : null}
      <form noValidate onSubmit={onSubmit} className="space-y-4">
        <Field label="Current password" error={errors.current_password?.message}>
          {({ id, describedBy, invalid }) => (
            <Input id={id} type="password" autoComplete="current-password" aria-describedby={describedBy} invalid={invalid} {...register("current_password")} />
          )}
        </Field>
        <Field label="New password" error={errors.new_password?.message}>
          {({ id, describedBy, invalid }) => (
            <Input id={id} type="password" autoComplete="new-password" aria-describedby={describedBy} invalid={invalid} {...register("new_password")} />
          )}
        </Field>
        <Field label="Repeat new password" error={errors.confirm?.message}>
          {({ id, describedBy, invalid }) => (
            <Input id={id} type="password" autoComplete="new-password" aria-describedby={describedBy} invalid={invalid} {...register("confirm")} />
          )}
        </Field>
        <Button type="submit" variant="secondary" loading={change.isPending}>
          Change password
        </Button>
      </form>
    </Card>
  );
}

// ---- signed-in browsers ----------------------------------------------------------------
/** A readable name for a browser, from its user agent. Falls back to "Unknown browser". */
export function describeBrowser(userAgent: string | null): string {
  if (!userAgent) return "Unknown browser";
  const ua = userAgent;
  const browser = /Edg\//.test(ua)
    ? "Edge"
    : /OPR\/|Opera/.test(ua)
      ? "Opera"
      : /Firefox\//.test(ua)
        ? "Firefox"
        : /Chrome\/|CriOS\//.test(ua)
          ? "Chrome"
          : /Safari\//.test(ua)
            ? "Safari"
            : null;
  const os = /Android/.test(ua)
    ? "Android"
    : /iPhone|iPad|iOS/.test(ua)
      ? "iOS"
      : /Windows/.test(ua)
        ? "Windows"
        : /Mac OS X|Macintosh/.test(ua)
          ? "macOS"
          : /Linux/.test(ua)
            ? "Linux"
            : null;
  if (browser && os) return `${browser} on ${os}`;
  return browser ?? os ?? "Unknown browser";
}

function SignInsCard() {
  const signIns = useSignIns();
  const others = useRevokeOtherSignIns();
  const otherCount = signIns.data?.filter((s) => !s.current).length ?? 0;
  return (
    <Card aria-labelledby="signins-title">
      <CardHeader id="signins-title" title="Where you're signed in" description="Sign out any browser you don't recognise." />
      {signIns.isPending ? (
        <PageLoading />
      ) : signIns.isError ? (
        <ErrorState error={signIns.error} title="Couldn't load your sign-ins" onRetry={() => void signIns.refetch()} />
      ) : (
        <>
          <ul className="divide-y divide-hairline">
            {signIns.data.map((s) => (
              <SignInRow key={s.id} signIn={s} />
            ))}
          </ul>
          {otherCount ? (
            <Button variant="secondary" className="mt-4" loading={others.isPending} onClick={() => others.mutate()}>
              Sign out all other browsers
            </Button>
          ) : null}
        </>
      )}
    </Card>
  );
}

function SignInRow({ signIn: s }: { signIn: SignIn }) {
  const revoke = useRevokeSignIn();
  return (
    <li className="flex flex-wrap items-center justify-between gap-3 py-3">
      <div className="min-w-0">
        <p className="flex flex-wrap items-center gap-2 text-body-md text-on-surface">
          {describeBrowser(s.user_agent)}
          {s.current ? <Pill tone="brand">This browser</Pill> : null}
        </p>
        <p className="text-body-sm text-on-surface-variant">
          Signed in {formatDate(s.created_at)} · last active {formatDate(s.last_seen_at)}
        </p>
      </div>
      {s.current ? null : (
        <Button variant="ghost" size="sm" loading={revoke.isPending} onClick={() => revoke.mutate(s.id)}>
          Sign out
        </Button>
      )}
    </li>
  );
}

// ---- delete account --------------------------------------------------------------------
const deleteSchema = z.object({ password: z.string().min(1, "Enter your password.") });
type DeleteValues = z.infer<typeof deleteSchema>;

function DeleteAccountCard() {
  const remove = useDeleteAccount();
  const navigate = useNavigate();
  const [confirming, setConfirming] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const {
    register,
    handleSubmit,
    setError,
    reset,
    formState: { errors },
  } = useForm<DeleteValues>({ resolver: zodResolver(deleteSchema), defaultValues: { password: "" } });
  const onSubmit = handleSubmit(async ({ password }) => {
    setFormError(null);
    try {
      await remove.mutateAsync(password);
      navigate("/login", { replace: true });
    } catch (error) {
      setFormError(applyServerErrors(error, ["password"], setError));
    }
  });
  return (
    <Card aria-labelledby="delete-title" className="lg:col-span-2">
      <CardHeader
        id="delete-title"
        title="Delete account"
        description="Removes your account, resumes, uploaded files, jobs, tailored versions, applications and interview practice. This happens at once and cannot be undone."
      />
      {confirming ? (
        <form noValidate onSubmit={onSubmit} className="max-w-md space-y-4">
          {formError ? (
            <Notice tone="critical" title="Could not delete the account">
              {formError}
            </Notice>
          ) : null}
          <Field label="Enter your password to confirm" error={errors.password?.message}>
            {({ id, describedBy, invalid }) => (
              <Input id={id} type="password" autoComplete="current-password" aria-describedby={describedBy} invalid={invalid} {...register("password")} />
            )}
          </Field>
          <div className="flex flex-wrap gap-2">
            <Button type="submit" variant="destructive" loading={remove.isPending}>
              Delete my account
            </Button>
            <Button
              type="button"
              variant="secondary"
              onClick={() => {
                setConfirming(false);
                setFormError(null);
                reset();
              }}
            >
              Cancel
            </Button>
          </div>
        </form>
      ) : (
        <Button variant="destructive" icon={<Trash2 className="size-4" aria-hidden />} onClick={() => setConfirming(true)}>
          Delete account
        </Button>
      )}
    </Card>
  );
}
