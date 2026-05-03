import { WindowGauge } from '@/components/widgets/WindowGauge';
import { CacheScore } from '@/components/widgets/CacheScore';
import { ActivityHeatmap } from '@/components/widgets/ActivityHeatmap';
import { ModelMix } from '@/components/widgets/ModelMix';
import { Forecast } from '@/components/widgets/Forecast';
import { CacheByHour } from '@/components/widgets/CacheByHour';
import { WorstCacheSessions } from '@/components/widgets/WorstCacheSessions';
import { EntrypointSplit } from '@/components/widgets/EntrypointSplit';
import { ToolUseChart } from '@/components/widgets/ToolUseChart';
import { CompactionWidget } from '@/components/widgets/CompactionWidget';
import { ModelRecommendations } from '@/components/widgets/ModelRecommendations';

export function Dashboard() {
  return (
    <div className="space-y-6">
      <h2 className="text-2xl font-semibold tracking-tight">Dashboard</h2>
      <div className="grid gap-6 lg:grid-cols-2">
        <WindowGauge />
        <Forecast />
      </div>
      <div className="grid gap-6 lg:grid-cols-2">
        <CacheScore />
        <CacheByHour />
      </div>
      <div className="grid gap-6 lg:grid-cols-2">
        <ActivityHeatmap />
        <ModelMix />
      </div>
      <div className="grid gap-6 lg:grid-cols-2">
        <WorstCacheSessions />
        <EntrypointSplit />
      </div>
      <div className="grid gap-6 lg:grid-cols-2">
        <ToolUseChart />
        <ModelRecommendations />
      </div>
      <CompactionWidget />
    </div>
  );
}
