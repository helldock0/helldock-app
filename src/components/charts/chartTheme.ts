// Shared color tokens for recharts — kept in sync with tailwind.config.ts.
export const CHART_COLORS = {
  gold: '#FFD700',
  crimson: '#DC143C',
  winGreen: '#34D399',
  fg: '#F5F5F7',
  muted: '#8A8A93',
  muted2: '#6B7280',
  surface2: '#2C2C32',
  surface3: '#35353C',
  line: '#2F2F36',
  lineStrong: '#3C3C44',
} as const

export const CHART_AXIS = {
  stroke: CHART_COLORS.muted2,
  fontSize: 11,
  tickLine: false,
}

export const CHART_GRID = {
  stroke: CHART_COLORS.line,
  strokeDasharray: '3 3',
}

export const CHART_TOOLTIP_STYLE = {
  backgroundColor: '#1B1B1F',
  border: `1px solid ${CHART_COLORS.lineStrong}`,
  borderRadius: 8,
  color: CHART_COLORS.fg,
  fontSize: 12,
  padding: '6px 10px',
}
