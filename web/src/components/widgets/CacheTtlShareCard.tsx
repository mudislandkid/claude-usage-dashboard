import { useMemo, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { useCacheTtlEfficiency } from '@/hooks/useCacheTtl';
import { buildShareSummary } from '@/lib/ttlSummary';

export function CacheTtlShareCard() {
  const { data, isLoading } = useCacheTtlEfficiency(30);
  const [copied, setCopied] = useState(false);

  const summary = useMemo(() => (data ? buildShareSummary(data) : ''), [data]);

  function copyToClipboard() {
    if (!summary) return;
    navigator.clipboard.writeText(summary).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Cache TTL — share with Anthropic</CardTitle>
        <p className="text-xs text-muted-foreground pt-1">
          Markdown summary derived from the Cache TTL efficiency widget. Paste into a
          GitHub issue against{' '}
          <a
            href="https://github.com/anthropics/claude-code"
            target="_blank"
            rel="noreferrer"
            className="underline hover:text-foreground"
          >
            anthropics/claude-code
          </a>{' '}
          if you want to flag the over-use of 1h cache TTL with concrete numbers from your
          own usage.
        </p>
      </CardHeader>
      <CardContent className="space-y-3">
        {isLoading || !data ? (
          <Skeleton className="h-48" />
        ) : (
          <>
            <div className="flex items-center justify-between">
              <div className="text-xs text-muted-foreground">
                Generated from the last {data.days} days of activity.
              </div>
              <Button variant="default" onClick={copyToClipboard}>
                {copied ? 'Copied' : 'Copy summary for Anthropic'}
              </Button>
            </div>
            <pre className="text-[11px] font-mono bg-muted/40 border border-border rounded-md p-3 overflow-x-auto whitespace-pre max-h-80 leading-relaxed">
              {summary}
            </pre>
          </>
        )}
      </CardContent>
    </Card>
  );
}
