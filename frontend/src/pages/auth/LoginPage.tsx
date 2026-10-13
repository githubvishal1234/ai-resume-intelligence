import { zodResolver } from "@hookform/resolvers/zod";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { z } from "zod";
import { Button } from "@/components/ui/Button";
import { Field, Input } from "@/components/ui/Field";
import { Notice } from "@/components/ui/Notice";
import { useAuthOptions, useLogin } from "@/hooks/useSession";
import { applyServerErrors } from "@/lib/formErrors";

const schema = z.object({
  email: z.string().trim().min(1, "Enter your email.").email("Enter a valid email address."),
  password: z.string().min(1, "Enter your password.").max(128, "Password is too long."),
});
type Values = z.infer<typeof schema>;

export function LoginPage() {
  const login = useLogin();
  const canReset = useAuthOptions().data?.password_reset === true;
  const navigate = useNavigate();
  const location = useLocation();
  const [formError, setFormError] = useState<string | null>(null);
  const {
    register,
    handleSubmit,
    setError,
    formState: { errors },
  } = useForm<Values>({ resolver: zodResolver(schema), defaultValues: { email: "", password: "" } });

  const from = (location.state as { from?: string } | null)?.from;

  const onSubmit = handleSubmit(async (values) => {
    setFormError(null);
    try {
      await login.mutateAsync(values);
      navigate(from && from.startsWith("/") ? from : "/", { replace: true });
    } catch (error) {
      setFormError(applyServerErrors(error, ["email", "password"], setError));
    }
  });

  return (
    <>
      <h1 className="font-display text-headline-md text-on-surface">Sign in</h1>
      <p className="mt-1 text-body-md text-on-surface-variant">Welcome back. Sign in to continue.</p>
      {formError ? (
        <Notice tone="critical" title="Could not sign in" className="mt-5">
          {formError}
        </Notice>
      ) : null}
      <form noValidate onSubmit={onSubmit} className="mt-6 space-y-4">
        <Field label="Email" error={errors.email?.message}>
          {({ id, describedBy, invalid }) => (
            <Input id={id} type="email" autoComplete="email" aria-describedby={describedBy} invalid={invalid} {...register("email")} />
          )}
        </Field>
        <Field label="Password" error={errors.password?.message}>
          {({ id, describedBy, invalid }) => (
            <Input
              id={id}
              type="password"
              autoComplete="current-password"
              aria-describedby={describedBy}
              invalid={invalid}
              {...register("password")}
            />
          )}
        </Field>
        {canReset ? (
          <p className="-mt-2 text-right text-body-sm">
            <Link to="/forgot-password" className="font-medium text-primary hover:underline">
              Forgot your password?
            </Link>
          </p>
        ) : null}
        <Button type="submit" className="w-full" loading={login.isPending}>
          Sign in
        </Button>
      </form>
      <p className="mt-6 text-center text-body-md text-on-surface-variant">
        New here?{" "}
        <Link to="/register" className="font-medium text-primary hover:underline">
          Create an account
        </Link>
      </p>
    </>
  );
}
