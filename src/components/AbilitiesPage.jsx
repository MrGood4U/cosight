import {
  AudioLines,
  Monitor,
  Pencil,
  Radio,
  Sparkles,
  Volume2,
} from 'lucide-react'


export function AbilitiesPage({ t, seeBboxDebugEnabled = false, setSeeBboxDebugEnabled = () => {} }) {
  const abilities = [
    {
      icon: <Monitor size={19} />,
      title: t('abilities.screenVision'),
      description: t('abilities.screenVisionDescription'),
      control: {
        label: t('abilities.seeBboxDebug'),
        hint: t('abilities.seeBboxDebugHint'),
        value: seeBboxDebugEnabled,
        onChange: setSeeBboxDebugEnabled,
      },
    },
    { icon: <AudioLines size={19} />, title: t('abilities.listening'), description: t('abilities.listeningDescription') },
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
export function AbilityCard({ icon, title, description, detail, hint, control }) {
  return <article className={`ability-card ${control ? 'ability-card-configurable' : ''}`}>
    <div className="ability-card-header"><div className="ability-icon">{icon}</div>{control && <div className="ability-card-control" title={control.hint}><span>{control.label}</span><button type="button" className={`toggle ${control.value ? 'on' : ''}`} onClick={() => control.onChange(!control.value)} aria-label={control.label} aria-pressed={control.value}><span /></button></div>}</div>
    <div className="ability-card-copy"><h2>{title}</h2><p>{description}</p>{detail && <div className="ability-card-detail">{detail}</div>}<small>{hint}</small></div>
  </article>
}
