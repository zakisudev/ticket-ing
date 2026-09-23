import { Navigate, Route, Routes } from 'react-router';
import { AuthLayout } from './features/auth/AuthLayout';
import { LoginPage } from './features/auth/LoginPage';
import { RegisterPage } from './features/auth/RegisterPage';
import { RequireAuth } from './features/auth/RequireAuth';
import { ProjectsPage } from './features/projects/ProjectsPage';
import { BoardPage } from './features/tickets/BoardPage';
import { TicketDetailPage } from './features/tickets/TicketDetailPage';
import { HomePage } from './features/projects/HomePage';

export default function App() {
  return (
    <Routes>
      <Route element={<AuthLayout />}>
        <Route path="/login" element={<LoginPage />} />
        <Route path="/register" element={<RegisterPage />} />
      </Route>

      <Route element={<RequireAuth />}>
        <Route path="/" element={<HomePage />} />
        <Route path="/projects" element={<ProjectsPage />} />
        <Route path="/p/:slug/board" element={<BoardPage />} />
        <Route path="/p/:slug/tickets/:ticketId" element={<TicketDetailPage />} />
      </Route>

      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
