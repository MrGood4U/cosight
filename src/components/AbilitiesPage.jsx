import {
  AudioLines,
  Monitor,
  Pencil,
  Radio,
  Sparkles,
  Volume2,
} from 'lucide-react'
import {
  DEFAULT_SEE_MAX_OBJECTS,
  SEE_MAX_OBJECTS_MAX,
  SEE_MAX_OBJECTS_MIN,
  DEFAULT_TURN_DETECTION_SILENCE_DURATION_MS,
  TURN_DETECTION_SILENCE_DURATION_MAX_MS,
  TURN_DETECTION_SILENCE_DURATION_MIN_MS,
} from '../app/shared.js'


export function AbilitiesPage({
  t,
  seeBboxDebugEnabled = false,
  setSeeBboxDebugEnabled = () => {},
  seeMaxObjects = DEFAULT_SEE_MAX_OBJECTS,
  setSeeMaxObjects = () => {},
  turnDetectionSilenceDurationMs = DEFAULT_TURN_DETECTION_SILENCE_DURATION_MS,
  setTurnDetectionSilenceDurationMs = () => {},
}) {
  const abilities = [
    {
      icon: <Monitor size={19} />,
      title: t('abilities.screenVision'),
      description: t('abilities.screenVisionDescription'),
      controls: [
        {
          label: t('abilities.seeBboxDebug'),
          hint: t('abilities.seeBboxDebugHint'),
          value: seeBboxDebugEnabled,
          onChange: setSeeBboxDebugEnabled,
        },
        {
          type: 'number',
          id: 'see-max-objects',
          label: t('abilities.seeMaxObjects'),
          hint: t('abilities.seeMaxObjectsHint'),
          value: seeMaxObjects,
          min: SEE_MAX_OBJECTS_MIN,
          max: SEE_MAX_OBJECTS_MAX,
          step: 1,
          unit: t('abilities.seeMaxObjectsUnit'),
          onChange: setSeeMaxObjects,
        },
      ],
    },
    {
      icon: <AudioLines size={19} />,
      title: t('abilities.listening'),
      description: t('abilities.listeningDescription'),
      control: {
        type: 'number',
        id: 'turn-detection-silence-duration',
        label: t('abilities.turnDetectionSilenceDuration'),
        hint: t('abilities.turnDetectionSilenceDurationHint'),
        value: turnDetectionSilenceDurationMs,
        min: TURN_DETECTION_SILENCE_DURATION_MIN_MS,
        max: TURN_DETECTION_SILENCE_DURATION_MAX_MS,
        step: 100,
        unit: t('abilities.turnDetectionSilenceDurationUnit'),
        onChange: setTurnDetectionSilenceDurationMs,
      },
    },
    { icon: <Volume2 size={19} />, title: t('abilities.speaking'), description: t('abilities.speakingDescription') },
    { icon: <Pencil size={19} />, title: t('abilities.drawing'), description: t('abilities.drawingDescription'), detail: t('abilities.drawingPrecisionDescription') },
    { icon: <Radio size={19} />, title: t('abilities.initiative'), description: t('abilities.initiativeDescription') },
  ]
  return <section className="abilities-page" aria-labelledby="abilities-title">
    <div className="abilities-header">
      <div>
        <span className="page-kicker">{t('abilities.kicker')}</span>
        <h1 id="abilities-title">{t('abilities.title')}</h1>
        <p>{t('abilities.description')}</p>
      </div>
      <div className="ability-count"><Sparkles size={16} /><span>{t('abilities.catalogCount', { total: abilities.length })}</span></div>
    </div>
    <div className="abilities-list">{abilities.map((ability) => <AbilityCard {...ability} hint={t('abilities.roleHint')} key={ability.title} />)}</div>
    <div className="abilities-note"><Sparkles size={16} /><div><strong>{t('abilities.noteTitle')}</strong><p>{t('abilities.noteDescription')}</p></div></div>
  </section>
}
export function AbilityCard({ icon, title, description, detail, hint, control, controls: controlList }) {
  const controls = Array.isArray(controlList) ? controlList : control ? [control] : []
  return <article className={`ability-card ${controls.length ? 'ability-card-configurable' : ''}`}>
    <div className="ability-card-header"><div className="ability-icon">{icon}</div>{controls.length > 0 && <div className="ability-card-controls">{controls.map((item, index) => item.type === 'number'
      ? <div className="ability-card-control ability-card-number-control" title={item.hint} key={item.id || `number-control-${index}`}>
        <label htmlFor={item.id}>{item.label}</label>
        <div className="ability-card-number-field">
          <input id={item.id} type="number" min={item.min} max={item.max} step={item.step} value={item.value} onChange={(event) => item.onChange(event.target.value)} aria-label={item.label} />
          <span>{item.unit}</span>
        </div>
      </div>
      : <div className="ability-card-control" title={item.hint} key={item.id || `toggle-control-${index}`}><span>{item.label}</span><button type="button" className={`toggle ${item.value ? 'on' : ''}`} onClick={() => item.onChange(!item.value)} aria-label={item.label} aria-pressed={item.value}><span /></button></div>)}</div>}</div>
    <div className="ability-card-copy"><h2>{title}</h2><p>{description}</p>{detail && <div className="ability-card-detail">{detail}</div>}<small>{hint}</small></div>
  </article>
}
