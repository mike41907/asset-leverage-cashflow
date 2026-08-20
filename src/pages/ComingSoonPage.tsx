import type { LucideIcon } from 'lucide-react'
import { ArrowRight, CheckCircle2, LockKeyhole } from 'lucide-react'
import type { PageKey } from '../domain/models'

interface ComingSoonPageProps {
  icon: LucideIcon
  eyebrow: string
  title: string
  description: string
  phase: string
  features: string[]
  onNavigate: (page: PageKey) => void
}

export function ComingSoonPage({ icon: Icon, eyebrow, title, description, phase, features, onNavigate }: ComingSoonPageProps) {
  return <div className="page-container coming-page"><section className="coming-hero card"><div className="coming-icon"><Icon size={30} /></div><div className="eyebrow"><span className="eyebrow-mark" />{eyebrow}</div><h1>{title}</h1><p>{description}</p><span className="phase-pill"><LockKeyhole size={14} />目前規劃於 {phase}</span></section><section className="card coming-detail"><div><div className="section-kicker">已預留的資料能力</div><h2>先把資料結構留好，逐步增加決策能力。</h2></div><div className="coming-feature-list">{features.map((feature) => <div key={feature}><CheckCircle2 size={17} />{feature}</div>)}</div><button type="button" className="button button-secondary" onClick={() => onNavigate('assets')}>回到資產基準線 <ArrowRight size={16} /></button></section></div>
}
