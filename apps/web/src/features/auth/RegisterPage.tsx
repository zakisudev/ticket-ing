import { useContext } from 'react';
import { Link, Navigate, useNavigate } from 'react-router';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import type { z } from 'zod';
import { registerSchema } from '@zakisu-tickets/shared';
import { AuthContext } from './AuthContext';
import { useRegister, useRegistrationStatus } from '@/api/hooks';
import { Button, Input, Spinner } from '@/components/ui';

const formSchema = registerSchema;
type FormValues = z.infer<typeof formSchema>;

export function RegisterPage() {
  const { user, isLoading } = useContext(AuthContext);
  const navigate = useNavigate();
  const status = useRegistrationStatus();
  const register = useRegister();

  const {
    register: registerField,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: { email: '', password: '' },
  });

  if (!isLoading && user) {
    return <Navigate to="/" replace />;
  }

  if (status.isLoading) return <Spinner label="Checking registration…" />;

  if (status.data && !status.data.open) {
    return (
      <div className="w-full max-w-sm rounded-lg border border-border bg-surface p-6 text-center text-sm">
        Registration is closed.
        <div className="mt-3">
          <Link to="/login" className="text-accent hover:underline">
            Sign in
          </Link>
        </div>
      </div>
    );
  }

  const onSubmit = handleSubmit(async (values) => {
    try {
      await register.mutateAsync(values);
      navigate('/', { replace: true });
    } catch {
      // Error surfaced via register.isError below.
    }
  });

  return (
    <div className="w-full max-w-sm rounded-lg border border-border bg-surface p-6">
      <h1 className="text-sm font-semibold">Create your account</h1>
      <p className="mt-1 text-xs text-text-muted">
        Your projects and tickets stay private to your account.
      </p>
      <form onSubmit={onSubmit} className="mt-4 space-y-3" noValidate>
        <div>
          <label htmlFor="name" className="mb-1 block text-xs text-text-muted">Name (optional)</label>
          <Input id="name" autoComplete="name" {...registerField('name')} />
          {errors.name ? <p className="mt-1 text-xs text-danger">{errors.name.message}</p> : null}
        </div>
        <div>
          <label htmlFor="email" className="mb-1 block text-xs text-text-muted">Email</label>
          <Input id="email" type="email" autoComplete="email" data-testid="register-email" {...registerField('email')} />
          {errors.email ? <p className="mt-1 text-xs text-danger">{errors.email.message}</p> : null}
        </div>
        <div>
          <label htmlFor="password" className="mb-1 block text-xs text-text-muted">Password (min 10 chars)</label>
          <Input id="password" type="password" autoComplete="new-password" data-testid="register-password" {...registerField('password')} />
          {errors.password ? <p className="mt-1 text-xs text-danger">{errors.password.message}</p> : null}
        </div>
        {register.isError ? (
          <p className="text-xs text-danger" data-testid="register-error" role="alert">
            {register.error.message}
          </p>
        ) : null}
        <Button type="submit" className="w-full" disabled={isSubmitting || register.isPending} data-testid="register-submit">
          {register.isPending ? 'Creating…' : 'Create account'}
        </Button>
      </form>
      <p className="mt-4 text-center text-xs text-text-muted">
        <Link to="/login" className="text-accent hover:underline">Back to sign in</Link>
      </p>
    </div>
  );
}
