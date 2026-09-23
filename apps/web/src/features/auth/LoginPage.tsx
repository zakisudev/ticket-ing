import { useContext } from 'react';
import { Link, Navigate, useLocation, useNavigate } from 'react-router';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import type { z } from 'zod';
import { loginSchema } from '@zakisu-tickets/shared';
import { AuthContext } from './AuthContext';
import { useLogin } from '@/api/hooks';
import { Button, Input } from '@/components/ui';

const formSchema = loginSchema;

type FormValues = z.infer<typeof formSchema>;

export function LoginPage() {
  const { user, isLoading } = useContext(AuthContext);
  const navigate = useNavigate();
  const location = useLocation();
  const login = useLogin();

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: { email: '', password: '' },
  });

  if (!isLoading && user) {
    return <Navigate to={location.state?.from ?? '/'} replace />;
  }

  const onSubmit = handleSubmit(async (values) => {
    try {
      await login.mutateAsync(values);
      navigate(location.state?.from ?? '/', { replace: true });
    } catch {
      // Error surfaced via login.isError below.
    }
  });

  return (
    <div className="w-full max-w-sm rounded-lg border border-border bg-surface p-6">
      <h1 className="text-sm font-semibold">Sign in</h1>
      <form onSubmit={onSubmit} className="mt-4 space-y-3" noValidate>
        <div>
          <label htmlFor="email" className="mb-1 block text-xs text-text-muted">Email</label>
          <Input id="email" type="email" autoComplete="email" data-testid="login-email" {...register('email')} />
          {errors.email ? <p className="mt-1 text-xs text-danger">{errors.email.message}</p> : null}
        </div>
        <div>
          <label htmlFor="password" className="mb-1 block text-xs text-text-muted">Password</label>
          <Input id="password" type="password" autoComplete="current-password" data-testid="login-password" {...register('password')} />
          {errors.password ? <p className="mt-1 text-xs text-danger">{errors.password.message}</p> : null}
        </div>
        {login.isError ? (
          <p className="text-xs text-danger" data-testid="login-error" role="alert">
            {login.error.message}
          </p>
        ) : null}
        <Button type="submit" className="w-full" disabled={isSubmitting || login.isPending} data-testid="login-submit">
          {login.isPending ? 'Signing in…' : 'Sign in'}
        </Button>
      </form>
      <p className="mt-4 text-center text-xs text-text-muted">
        First time?{' '}
        <Link to="/register" className="text-accent hover:underline">
          Create the owner account
        </Link>
      </p>
    </div>
  );
}
