import { zodResolver } from "@hookform/resolvers/zod";
import { useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { Link, useSearchParams } from "react-router-dom";
import { z } from "zod";
import { Button, ButtonLink } from "@/components/ui/Button";
import { Field, Input } from "@/components/ui/Field";
import { Notice } from "@/components/ui/Notice";
import { useConfirmReset, useRequestReset } from "@/hooks/useSession";
import { applyServerErrors } from "@/lib/formErrors";
import { ApiError } from "@/services/apiClient";

const forgotSchema = z.object({
  email: z.string().trim().min(1, "Enter your email.").email("Enter a valid email address."),
});
type ForgotValues = z.infer<typeof forgotSchema>;

export function ForgotPasswordPage() {
  const send = useRequestReset();
  const [sentTo, setSentTo] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const {
    register,
    handleSubmit,
    setError,
    formState: { errors },
  } = useForm<ForgotValues>({ resolver: zodResolver(forgotSchema), defaultValues: { email: "" } });

  const onSubmit = handleSubmit(async ({ email }) => {
    setFormError(null);
    try {
      await send.mutateAsync(email);
      setSentTo(email);
    } catch (error) {
      setFormError(applyServerErrors(error, ["email"], setError));
    }
  });

  return (
    <>
      <h1 className="font-display text-headline-md text-on-surface">Reset your password</h1>
      {sentTo ? (
        <Notice tone="success" title="Check your email" className="mt-5">
          If an account uses {sentTo}, we've sent it a link to choose a new password. The link works once and expires
          soon.
        </Notice>
      ) : (
        <>
          <p className="mt-1 text-body-md text-on-surface-variant">We'll email you a link to choose a new password.</p>
          {formError ? (
            <Notice tone="critical" title="Could not send the link" className="mt-5">
              {formError}
            </Notice>
          ) : null}
          <form noValidate onSubmit={onSubmit} className="mt-6 space-y-4">
            <Field label="Email" error={errors.email?.message}>
              {({ id, describedBy, invalid }) => (
                <Input id={id} type="email" autoComplete="email" aria-describedby={describedBy} invalid={invalid} {...register("email")} />
              )}
            </Field>
            <Button type="submit" className="w-full" loading={send.isPending}>
              Send reset link
            </Button>
          </form>
        </>
      )}
      <p className="mt-6 text-center text-body-md text-on-surface-variant">
        <Link to="/login" className="font-medium text-primary hover:underline">
          Back to sign in
        </Link>
      </p>
    </>
  );
}

const resetSchema = z
  .object({
    new_password: z.string().min(1, "Enter a new password.").max(128, "Password is too long."),
    confirm: z.string(),
  })
  .refine((v) => v.new_password === v.confirm, { path: ["confirm"], message: "The passwords don't match." });
type ResetValues = z.infer<typeof resetSchema>;

export function ResetPasswordPage() {
  const [params] = useSearchParams();
  // Read the token once, then drop it from the address bar and history.
  const [token] = useState(() => params.get("token") ?? "");
  useEffect(() => {
    if (params.has("token")) window.history.replaceState(window.history.state, "", window.location.pathname);
  }, [params]);
  const confirm = useConfirmReset();
  const [done, setDone] = useState(false);
  const [linkInvalid, setLinkInvalid] = useState(!token);
  const [formError, setFormError] = useState<string | null>(null);
  const {
    register,
    handleSubmit,
    setError,
    formState: { errors },
  } = useForm<ResetValues>({ resolver: zodResolver(resetSchema), defaultValues: { new_password: "", confirm: "" } });

  const onSubmit = handleSubmit(async ({ new_password }) => {
    setFormError(null);
    try {
      await confirm.mutateAsync({ token, new_password });
      setDone(true);
    } catch (error) {
      if (error instanceof ApiError && error.code === "RESET_LINK_INVALID") setLinkInvalid(true);
      else setFormError(applyServerErrors(error, ["new_password"], setError));
    }
  });

  if (done) {
    return (
      <>
        <h1 className="font-display text-headline-md text-on-surface">Password changed</h1>
        <p className="mt-1 text-body-md text-on-surface-variant">
          You've been signed out everywhere. Sign in with your new password.
        </p>
        <ButtonLink to="/login" variant="primary" className="mt-6 w-full">
          Sign in
        </ButtonLink>
      </>
    );
  }
  if (linkInvalid) {
    return (
      <>
        <h1 className="font-display text-headline-md text-on-surface">This link doesn't work</h1>
        <p className="mt-1 text-body-md text-on-surface-variant">
          It has expired or was already used. Reset links work once.
        </p>
        <ButtonLink to="/forgot-password" variant="primary" className="mt-6 w-full">
          Ask for a new link
        </ButtonLink>
      </>
    );
  }
  return (
    <>
      <h1 className="font-display text-headline-md text-on-surface">Choose a new password</h1>
      {formError ? (
        <Notice tone="critical" title="Could not change the password" className="mt-5">
          {formError}
        </Notice>
      ) : null}
      <form noValidate onSubmit={onSubmit} className="mt-6 space-y-4">
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
        <Button type="submit" className="w-full" loading={confirm.isPending}>
          Change password
        </Button>
      </form>
    </>
  );
}
