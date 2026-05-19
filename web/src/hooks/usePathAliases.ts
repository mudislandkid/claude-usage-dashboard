import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';

export interface PathAlias {
  from: string;
  to: string;
  createdAt: string;
}

export function usePathAliases() {
  return useQuery({
    queryKey: ['pathAliases'],
    queryFn: () => api<{ aliases: PathAlias[] }>('/aliases'),
  });
}

export function useAliasCandidates() {
  return useQuery({
    queryKey: ['pathAliasCandidates'],
    queryFn: () => api<{ paths: string[] }>('/aliases/candidates'),
  });
}

function invalidateAll(qc: ReturnType<typeof useQueryClient>) {
  qc.invalidateQueries({ queryKey: ['pathAliases'] });
  qc.invalidateQueries({ queryKey: ['pathAliasCandidates'] });
  // Aliasing changes the shape of projects + costs.
  qc.invalidateQueries({ queryKey: ['projects'] });
  qc.invalidateQueries({ queryKey: ['costBreakdown'] });
  qc.invalidateQueries({ queryKey: ['project'] });
}

export function useUpsertAlias() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: { from: string; to: string }) =>
      api<{ ok: boolean }>('/aliases', {
        method: 'POST',
        body: JSON.stringify(input),
      }),
    onSuccess: () => invalidateAll(qc),
  });
}

export function useDeleteAlias() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (from: string) =>
      api<{ ok: boolean }>(`/aliases?from=${encodeURIComponent(from)}`, {
        method: 'DELETE',
      }),
    onSuccess: () => invalidateAll(qc),
  });
}
