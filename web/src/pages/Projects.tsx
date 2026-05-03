import { ProjectLeaderboard } from '@/components/widgets/ProjectLeaderboard';

export function Projects() {
  return (
    <div className="space-y-6">
      <h2 className="text-2xl font-semibold tracking-tight">Projects</h2>
      <ProjectLeaderboard />
    </div>
  );
}
