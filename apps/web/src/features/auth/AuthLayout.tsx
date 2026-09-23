import { Outlet } from 'react-router';

export function AuthLayout() {
  return (
    <div className="flex min-h-full flex-col items-center justify-center px-4 py-10">
      <div className="mb-8 select-none text-center">
        <div className="text-lg font-bold tracking-tight">Zakisu Tickets</div>
        <div className="mt-1 text-xs text-text-muted">Engineering memory for solo builders</div>
      </div>
      <Outlet />
    </div>
  );
}
