import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  BarChart3,
  CalendarDays,
  LoaderCircle,
  RotateCcw,
} from 'lucide-react'

import {
  MAX_USAGE_BUCKETS,
  USAGE_GRANULARITIES,
  USAGE_PRESETS,
  buildUsageChart,
  formatUsageCompact,
  formatUsageNumber,
  makeUsageRange,
  parseUsageDate,
  usageBucketCount,
  usageBucketLabel,
  usageFilterTimestamp,
  usageGranularity,
  usageRangeLabel,
} from '../app/shared.js'

export function UsagePage({ t, language }) {
  const initialRange = useMemo(() => makeUsageRange({ days: 7 }), [])
  const [draftFrom, setDraftFrom] = useState(initialRange.from)
  const [draftTo, setDraftTo] = useState(initialRange.to)
  const [appliedFrom, setAppliedFrom] = useState(initialRange.from)
  const [appliedTo, setAppliedTo] = useState(initialRange.to)
  const [draftGranularity, setDraftGranularity] = useState('auto')
  const [appliedGranularity, setAppliedGranularity] = useState('auto')
  const [records, setRecords] = useState([])
  const [hiddenModels, setHiddenModels] = useState(() => new Set())
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const loadUsage = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      if (typeof window.cosight?.getUsage !== 'function') throw new Error(t('usage.unavailable'))
      const result = await window.cosight.getUsage({
        from: usageFilterTimestamp(appliedFrom),
        to: usageFilterTimestamp(appliedTo, true),
      })
      if (!result?.ok) throw new Error(result?.error || t('usage.unavailable'))
      setRecords(Array.isArray(result.records) ? result.records : [])
    } catch (loadError) {
      setRecords([])
      setError(loadError?.message || String(loadError))
    } finally {
      setLoading(false)
    }
  }, [appliedFrom, appliedTo, t])

  useEffect(() => { void loadUsage() }, [loadUsage])

  const chart = useMemo(() => buildUsageChart(records, appliedFrom, appliedTo, appliedGranularity), [records, appliedFrom, appliedTo, appliedGranularity])
  const activePreset = useMemo(() => USAGE_PRESETS.find((preset) => {
    const range = makeUsageRange(preset)
    return range.from === draftFrom && range.to === draftTo
  })?.key || '', [draftFrom, draftTo])
  const resolvedGranularityLabel = chart.granularity === 'minute'
    ? t('usage.granularityMinute')
    : chart.granularity === 'hour'
      ? t('usage.granularityHour')
      : chart.granularity === 'week' ? t('usage.granularityWeek') : t('usage.granularityDay')
  const granularityLabel = appliedGranularity === 'auto'
    ? t('usage.granularityAuto', { value: resolvedGranularityLabel })
    : resolvedGranularityLabel

  useEffect(() => {
    const models = new Set(chart.series.map((seriesItem) => seriesItem.model))
    setHiddenModels((current) => {
      const next = new Set([...current].filter((model) => models.has(model)))
      return next.size === current.size ? current : next
    })
  }, [chart.series])

  const applyRange = (from = draftFrom, to = draftTo, granularity = draftGranularity) => {
    const fromDate = parseUsageDate(from)
    const toDate = parseUsageDate(to, true)
    if (!fromDate || !toDate || fromDate > toDate) {
      setError(t('usage.invalidRange'))
      return
    }
    const normalizedGranularity = USAGE_GRANULARITIES.includes(granularity) ? granularity : 'auto'
    const resolvedGranularity = usageGranularity(fromDate, toDate, normalizedGranularity)
    if (usageBucketCount(fromDate, toDate, resolvedGranularity) > MAX_USAGE_BUCKETS) {
      setError(t('usage.rangeTooDetailed', { max: formatUsageNumber(MAX_USAGE_BUCKETS) }))
      return
    }
    setError('')
    setAppliedFrom(from)
    setAppliedTo(to)
    setAppliedGranularity(normalizedGranularity)
  }

  const choosePreset = (preset) => {
    const range = makeUsageRange(preset)
    setDraftFrom(range.from)
    setDraftTo(range.to)
    applyRange(range.from, range.to)
  }

  const toggleModel = (model) => setHiddenModels((current) => {
    const next = new Set(current)
    if (next.has(model)) next.delete(model)
    else next.add(model)
    return next
  })

  return <section className="usage-page" aria-labelledby="usage-title">
    <div className="usage-header">
      <div>
        <span className="page-kicker">{t('usage.kicker')}</span>
        <h1 id="usage-title">{t('usage.title')}</h1>
        <p>{t('usage.description')}</p>
      </div>
      <button type="button" className="outline-button usage-refresh" onClick={() => void loadUsage()} disabled={loading}>
        {loading ? <LoaderCircle className="spin" size={15} /> : <RotateCcw size={15} />}
        {t('usage.refresh')}
      </button>
    </div>

    <div className="usage-toolbar">
      <div className="usage-presets"><span className="usage-toolbar-label">{t('usage.presets')}</span>{USAGE_PRESETS.map((preset) => <button type="button" className={`usage-preset ${activePreset === preset.key ? 'active' : ''}`} key={preset.key} onClick={() => choosePreset(preset)}>{t(`usage.${preset.key}`)}</button>)}</div>
      <div className="usage-custom-range">
        <label className="usage-field"><span><CalendarDays size={14} />{t('usage.from')}</span><input type="datetime-local" value={draftFrom} max={draftTo || undefined} onChange={(event) => setDraftFrom(event.target.value)} /></label>
        <label className="usage-field"><span><CalendarDays size={14} />{t('usage.to')}</span><input type="datetime-local" value={draftTo} min={draftFrom || undefined} onChange={(event) => setDraftTo(event.target.value)} /></label>
        <label className="usage-field"><span><BarChart3 size={14} />{t('usage.granularity')}</span><select className="usage-select" value={draftGranularity} onChange={(event) => setDraftGranularity(event.target.value)}><option value="auto">{t('usage.granularityAutoOption')}</option><option value="minute">{t('usage.granularityMinute')}</option><option value="hour">{t('usage.granularityHour')}</option><option value="day">{t('usage.granularityDay')}</option><option value="week">{t('usage.granularityWeek')}</option></select></label>
        <button type="button" className="primary-button usage-apply" onClick={() => applyRange()}>{t('usage.apply')}</button>
      </div>
    </div>

    {error && <div className="usage-error" role="alert"><span>{t('usage.loadFailed', { message: error })}</span><button type="button" className="text-link" onClick={() => void loadUsage()}>{t('usage.retry')}</button></div>}
    {loading ? <div className="usage-loading"><LoaderCircle className="spin" size={18} />{t('usage.loading')}</div> : <>
      <div className="usage-summary-grid">
        <div className="usage-summary-card"><small>{t('usage.totalTokens')}</small><strong>{formatUsageNumber(chart.totalTokens, language)}</strong><span>{t('usage.tokens')}</span></div>
        <div className="usage-summary-card"><small>{t('usage.modelCount')}</small><strong>{formatUsageNumber(chart.series.length, language)}</strong><span>{t('usage.modelsUnit')}</span></div>
        <div className="usage-summary-card"><small>{t('usage.recordCount')}</small><strong>{formatUsageNumber(records.length, language)}</strong><span>{t('usage.recordsUnit')}</span></div>
        <div className="usage-summary-card"><small>{t('usage.granularity')}</small><strong className="usage-summary-text">{granularityLabel}</strong><span>{usageRangeLabel(appliedFrom, language)} – {usageRangeLabel(appliedTo, language, true)}</span></div>
      </div>
      {chart.series.length ? <>
        <section className="usage-panel" aria-labelledby="usage-chart-title">
          <div className="usage-panel-header"><div><h2 id="usage-chart-title">{t('usage.chartTitle')}</h2><p>{t('usage.chartHint')}</p></div><span className="usage-panel-range">{usageRangeLabel(appliedFrom, language)} – {usageRangeLabel(appliedTo, language, true)}</span></div>
          <UsageChart chart={chart} hiddenModels={hiddenModels} onToggleModel={toggleModel} language={language} t={t} />
        </section>
        <UsageDataTable chart={chart} language={language} t={t} />
      </> : <div className="usage-empty"><BarChart3 size={21} /><div><strong>{t('usage.emptyTitle')}</strong><p>{t('usage.emptyDescription')}</p></div></div>}
    </>}
  </section>
}

export function UsageChart({ chart, hiddenModels, onToggleModel, language, t }) {
  const width = 1000
  const height = 360
  const plot = { left: 72, top: 20, width: 900, height: 260 }
  const visibleSeries = chart.series.filter((seriesItem) => !hiddenModels.has(seriesItem.model))
  const valuesForScale = (visibleSeries.length ? visibleSeries : chart.series).flatMap((seriesItem) => seriesItem.values)
  const highestValue = Math.max(1, ...valuesForScale)
  const scaleStep = Math.pow(10, Math.floor(Math.log10(highestValue / 4))) || 1
  const yMax = Math.max(scaleStep, Math.ceil(highestValue / scaleStep) * scaleStep)
  const xFor = (index) => chart.buckets.length <= 1 ? plot.left + plot.width / 2 : plot.left + (index / (chart.buckets.length - 1)) * plot.width
  const yFor = (value) => plot.top + plot.height - (value / yMax) * plot.height
  const labelStep = Math.max(1, Math.ceil(chart.buckets.length / 6))
  const labelIndexes = new Set([0, Math.max(0, chart.buckets.length - 1)])
  for (let index = 0; index < chart.buckets.length; index += labelStep) labelIndexes.add(index)
  const yTicks = Array.from({ length: 5 }, (_, index) => (yMax / 4) * index)

  return <div className="usage-chart-wrap">
    <div className="usage-chart-scroll"><svg className="usage-chart-svg" viewBox={`0 0 ${width} ${height}`} role="img" aria-label={t('usage.chartAriaLabel')}>
      <title>{t('usage.chartAriaLabel')}</title>
      {yTicks.map((value) => <g key={`y-${value}`}><line className="usage-gridline" x1={plot.left} x2={plot.left + plot.width} y1={yFor(value)} y2={yFor(value)} /><text className="usage-y-label" x={plot.left - 12} y={yFor(value) + 4} textAnchor="end">{formatUsageCompact(value, language)}</text></g>)}
      <line className="usage-axis" x1={plot.left} x2={plot.left} y1={plot.top} y2={plot.top + plot.height} />
      <line className="usage-axis" x1={plot.left} x2={plot.left + plot.width} y1={plot.top + plot.height} y2={plot.top + plot.height} />
      <text className="usage-axis-title" x="18" y={plot.top + plot.height / 2} textAnchor="middle" transform={`rotate(-90 18 ${plot.top + plot.height / 2})`}>{t('usage.tokenAxis')}</text>
      <text className="usage-axis-title" x={plot.left + plot.width / 2} y={height - 8} textAnchor="middle">{t('usage.timeAxis')}</text>
      {Array.from(labelIndexes).sort((left, right) => left - right).map((index) => <text className="usage-x-label" key={`x-${index}`} x={xFor(index)} y={plot.top + plot.height + 29} textAnchor={index === 0 ? 'start' : index === chart.buckets.length - 1 ? 'end' : 'middle'}>{usageBucketLabel(chart.buckets[index], chart.granularity, language)}</text>)}
      {visibleSeries.map((seriesItem) => <g key={seriesItem.model}>
        <path className="usage-line" stroke={seriesItem.color} d={seriesItem.values.map((value, index) => `${index ? 'L' : 'M'} ${xFor(index)} ${yFor(value)}`).join(' ')} />
        {chart.buckets.length <= 120 && seriesItem.values.map((value, index) => <circle className="usage-point" key={`${seriesItem.model}-${index}`} cx={xFor(index)} cy={yFor(value)} r="3.5" fill={seriesItem.color}><title>{`${seriesItem.model} · ${usageBucketLabel(chart.buckets[index], chart.granularity, language)}: ${formatUsageNumber(value, language)} ${t('usage.tokens')}`}</title></circle>)}
      </g>)}
      {!visibleSeries.length && <text className="usage-chart-empty-label" x={plot.left + plot.width / 2} y={plot.top + plot.height / 2} textAnchor="middle">{t('usage.allHidden')}</text>}
    </svg></div>
    <div className="usage-legend" aria-label={t('usage.legend')}>
      {chart.series.map((seriesItem) => <button type="button" className={`usage-legend-item ${hiddenModels.has(seriesItem.model) ? 'is-hidden' : ''}`} key={seriesItem.model} onClick={() => onToggleModel(seriesItem.model)} aria-pressed={!hiddenModels.has(seriesItem.model)}><span className="usage-legend-swatch" style={{ '--usage-color': seriesItem.color }} /><span>{seriesItem.model}</span><small>{formatUsageCompact(seriesItem.total, language)} {t('usage.tokens')}</small></button>)}
    </div>
  </div>
}

export function UsageDataTable({ chart, language, t }) {
  return <details className="usage-data-details"><summary>{t('usage.details')}</summary><div className="usage-table-wrap"><table className="usage-table"><thead><tr><th scope="col">{t('usage.time')}</th>{chart.series.map((seriesItem) => <th scope="col" key={seriesItem.model}>{seriesItem.model}</th>)}<th scope="col">{t('usage.total')}</th></tr></thead><tbody>{chart.buckets.map((bucket, index) => { const total = chart.series.reduce((sum, seriesItem) => sum + seriesItem.values[index], 0); return <tr key={bucket.toISOString()}><th scope="row">{usageBucketLabel(bucket, chart.granularity, language)}</th>{chart.series.map((seriesItem) => <td key={seriesItem.model}>{formatUsageNumber(seriesItem.values[index], language)}</td>)}<td>{formatUsageNumber(total, language)}</td></tr> })}</tbody></table></div></details>
}
