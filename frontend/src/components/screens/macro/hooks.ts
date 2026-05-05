import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { fetchMacroDashboard, refreshMacro } from '../../../lib/api'
import { fixtureDashboard } from './fixtures'
import type { MacroDashboardResponse, AssetScoreCard, BorderState } from './types'

const BORDER_STATE_MAP: Record<string, BorderState> = {
  bullish: 'green',
  bearish: 'yellow',
  neutral: 'muted',
}

function normalizeDashboard(raw: MacroDashboardResponse): MacroDashboardResponse {
  const normalizedScores: Record<string, AssetScoreCard> = {}
  for (const [key, card] of Object.entries(raw.asset_scores ?? {})) {
    normalizedScores[key] = {
      ...card,
      border_state: BORDER_STATE_MAP[card.border_state as string] ?? (card.border_state as BorderState),
    }
  }
  return {
    ...raw,
    asset_scores: normalizedScores,
  }
}

export function useMacroDashboard() {
  return useQuery<MacroDashboardResponse>({
    queryKey: ['macro', 'dashboard'],
    queryFn: () => fetchMacroDashboard().then(normalizeDashboard),
    staleTime: 60_000,
    refetchInterval: 5 * 60_000,
    retry: 2,
    placeholderData: fixtureDashboard,
  })
}

export function useMacroRefresh() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: refreshMacro,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['macro', 'dashboard'] })
    },
  })
}