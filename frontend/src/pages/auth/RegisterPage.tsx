import { zodResolver } from "@hookform/resolvers/zod";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { z } from "zod";
import { Button } from "@/components/ui/Button";
import { Field, Input } from "@/components/ui/Field";
import { Notice } from "@/components/ui/Notice";
import { useRegister } from "@/hooks/useSession";
import { applyServerErrors } from "@/lib/formErrors";

/** Mirrors the backend default (PASSWORD_MIN_LENGTH); the server stays the source of truth. */
export const PASSWORD_MIN = 10;

const schema = z
  .object({
    display_name: z.string().trim().min(1, "Enter your name.").max(120, "Name is too long."),
    email: z.string().trim().min(1, "Enter your email.").email("Enter a valid email address."),
    password: z
      .string()
      .min(PASSWORD_MIN, `Use at least ${PASSWORD_MIN} characters.`)
      .max(128, "Password is too long."),
    confirm: z.string(),
  })
  .refine((v) => v.password === v.confirm, { path: ["confirm"], message: "Passwords do not match." });
type Values = z.infer<typeof schema>;

export function RegisterPage() {
  const registerUser = useRegister();
  const navigate = useNavigate();
  const wantsPro = useSearchParams()[0].get("plan") === "pro";
  const [formError, setFormError] = useState<string | null>(null);
  const {
    register,
    handleSubmit,
    setError,
    formState: { errors },
  } = useForm<Values>({
    resolver: zodResolver(schema),
    defaultValues: { display_name: "", email: "", password: "", confirm: "" },
  });

  const onSubmit = handleSubmit(async ({ confirm: _confirm, ...values }) => {
    setFormError(null);
    try {
      await registerUser.mutateAsync(values);
      // From the Pro waitlist button: back to pricing to confirm with one click.
      navigate(wantsPro ? "/pricing?join=pro" : "/", { replace: true });
    } catch (error) {
      setFormError(applyServerErrors(error, ["display_name", "email", "password"], setError));
    }
  });

  return (
    <>
      <h1 className="font-display text-headline-lg text-on-surface">Create your account</h1>
      <p className="mt-1 text-body-md text-on-surface-variant">Your resume data stays private to your account.</p>
      {wantsPro ? (
        <Notice tone="info" title="Joining the Pro waitlist" className="mt-5">
          Start with a free account. Next, you'll confirm your place on the waitlist. No payment now.
        </Notice>
      ) : null}
      {formError ? (
        <Notice tone="critical" title="Could not create the account" className="mt-5">
          {formError}
        </Notice>
      ) : null}
      <form noValidate onSubmit={onSubmit} className="mt-6 space-y-4">
        <Field label="Name" error={errors.display_name?.message}>
          {({ id, describedBy, invalid }) => (
            <Input id={id} autoComplete="name" aria-describedby={describedBy} invalid={invalid} {...register("display_name")} />
          )}
        </Field>
        <Field label="Email" error={errors.email?.message}>
          {({ id, describedBy, invalid }) => (
            <Input id={id} type="email" autoComplete="email" aria-describedby={describedBy} invalid={invalid} {...register("email")} />
          )}
        </Field>
        <Field label="Password" hint={`At least ${PASSWORD_MIN} characters.`} error={errors.password?.message}>
          {({ id, describedBy, invalid }) => (
            <Input
              id={id}
              type="password"
              autoComplete="new-password"
              aria-describedby={describedBy}
              invalid={invalid}
              {...register("password")}
            />
          )}
        </Field>
        <Field label="Confirm password" error={errors.confirm?.message}>
          {({ id, describedBy, invalid }) => (
            <Input
              id={id}
              type="password"
              autoComplete="new-password"
              aria-describedby={describedBy}
              invalid={invalid}
              {...register("confirm")}
            />
          )}
        </Field>
        <Button type="submit" className="w-full" loading={registerUser.isPending}>
          Create account
        </Button>
      </form>
      <p className="mt-6 text-center text-body-md text-on-surface-variant">
        Already have an account?{" "}
        <Link to="/login" className="font-medium text-primary hover:underline">
          Sign in
        </Link>
      </p>
    </>
  );
}
