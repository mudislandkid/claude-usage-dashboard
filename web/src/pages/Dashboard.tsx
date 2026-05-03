import { WindowGauge } from '@/components/widgets/WindowGauge';
import { CacheScore } from '@/components/widgets/CacheScore';
import { ActivityHeatmap } from '@/components/widgets/ActivityHeatmap';
import { ModelMix } from '@/components/widgets/ModelMix';

export function Dashboard() {
  return (
    <div className="space-y-6">
      <h2 className="text-2xl font-semibold tracking-tight">Dashboard</h2>
      <div className="grid gap-6 lg:grid-cols-2">
        <WindowGauge />
        <CacheScore />
      </div>
      <div className="grid gap-6 lg:grid-cols-2">
        <ActivityHeatmap />
        <ModelMix />
      </div>
    </div>
  );
}
