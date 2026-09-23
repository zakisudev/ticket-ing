import { useEffect } from 'react';
import { useNavigate } from 'react-router';
import { FolderPlus } from 'lucide-react';
import { useProjects } from '@/api/hooks';
import { Spinner, EmptyState, Button } from '@/components/ui';

const LAST_PROJECT_KEY = 'zt-last-project-slug';

export function HomePage() {
  const { data, isLoading } = useProjects();
  const navigate = useNavigate();

  useEffect(() => {
    if (isLoading) return;
    const projects = data?.projects ?? [];
    if (projects.length > 0) {
      const last = localStorage.getItem(LAST_PROJECT_KEY);
      const target = projects.find((p) => p.slug === last) ?? projects[0]!;
      navigate(`/p/${target.slug}/board`, { replace: true });
    }
  }, [data, isLoading, navigate]);

  if (isLoading) return <Spinner />;

  return (
    <div className="mx-auto max-w-xl p-6">
      <EmptyState
        icon={<FolderPlus size={28} />}
        title="Create your first project"
        hint="Projects hold tickets. TemariOne, BellyBlast 30, Parking Management — one board each."
        action={
          <Button onClick={() => navigate('/projects')} data-testid="home-create-project">
            Create project
          </Button>
        }
      />
    </div>
  );
}

export { LAST_PROJECT_KEY };
