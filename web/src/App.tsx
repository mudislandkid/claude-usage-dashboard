import { Routes, Route } from 'react-router-dom';
import { AppShell } from '@/components/layout/AppShell';
import { Dashboard } from '@/pages/Dashboard';
import { Projects } from '@/pages/Projects';
import { ProjectDetail } from '@/pages/ProjectDetail';
import { SessionDetail } from '@/pages/SessionDetail';
import { Settings } from '@/pages/Settings';
import { Compare } from '@/pages/Compare';

export default function App() {
  return (
    <AppShell>
      <Routes>
        <Route path="/" element={<Dashboard />} />
        <Route path="/projects" element={<Projects />} />
        <Route path="/projects/:id" element={<ProjectDetail />} />
        <Route path="/compare" element={<Compare />} />
        <Route path="/sessions/:id" element={<SessionDetail />} />
        <Route path="/settings" element={<Settings />} />
      </Routes>
    </AppShell>
  );
}
