import { useState, type FormEvent, type ReactNode } from 'react'
import { Check, ChevronDown, Edit3, House, Landmark, Plus, Trash2, X } from 'lucide-react'
import type { Liability, LiabilityType, RealEstateAsset } from '../domain/models'
import { formatPercent, formatTwd } from '../shared/formatters'
import { createId } from '../shared/id'

interface GeneralLiabilitiesPanelProps {
  liabilities: Liability[]
  realEstate: RealEstateAsset[]
  displayMode: 'exact' | 'compact'
  onSave: (liability: Liability) => Promise<void>
  onDelete: (id: string) => Promise<void>
}

interface LiabilityDraft {
  type: LiabilityType
  name: string
  institution: string
  linkedAssetId: string | null
  principal: number
  outstandingBalance: number
  annualInterestRatePercent: number
  monthlyPayment: number
  borrowedAt: string
  maturityDate: string
  isActive: boolean
  notes: string
}

const liabilityTypes: { value: LiabilityType; label: string }[] = [
  { value: 'mortgage', label: '房貸' },
  { value: 'car-loan', label: '車貸' },
  { value: 'personal-loan', label: '信貸／個人貸款' },
  { value: 'credit', label: '信用卡／循環' },
  { value: 'other', label: '其他負債' },
]

function todayInputValue(): string {
  return new Date().toISOString().slice(0, 10)
}

function createDefaultDraft(): LiabilityDraft {
  return {
    type: 'mortgage',
    name: '',
    institution: '',
    linkedAssetId: null,
    principal: 0,
    outstandingBalance: 0,
    annualInterestRatePercent: 0,
    monthlyPayment: 0,
    borrowedAt: todayInputValue(),
    maturityDate: '',
    isActive: true,
    notes: '',
  }
}

function typeLabel(type: LiabilityType): string {
  return liabilityTypes.find((item) => item.value === type)?.label ?? '其他負債'
}

function draftFrom(liability: Liability): LiabilityDraft {
  return {
    type: liability.type,
    name: liability.name,
    institution: liability.institution,
    linkedAssetId: liability.linkedAssetId,
    principal: liability.principal,
    outstandingBalance: liability.outstandingBalance,
    annualInterestRatePercent: liability.annualInterestRatePercent,
    monthlyPayment: liability.monthlyPayment,
    borrowedAt: liability.borrowedAt,
    maturityDate: liability.maturityDate ?? '',
    isActive: liability.isActive,
    notes: liability.notes,
  }
}

function FormField({ label, hint, children, wide = false }: { label: string; hint?: string; children: ReactNode; wide?: boolean }) {
  return <label className={`form-field ${wide ? 'form-field-wide' : ''}`}><span>{label}{hint && <small>{hint}</small>}</span>{children}</label>
}

function SelectChevron() {
  return <ChevronDown className="select-chevron" size={16} aria-hidden="true" />
}

function LiabilityModal({ liability, realEstate, onClose, onSave }: { liability: Liability | null; realEstate: RealEstateAsset[]; onClose: () => void; onSave: (liability: Liability) => Promise<void> }) {
  const [draft, setDraft] = useState<LiabilityDraft>(() => liability ? draftFrom(liability) : createDefaultDraft())

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    const time = new Date().toISOString()
    await onSave({
      id: liability?.id ?? createId('liability'),
      type: draft.type,
      name: draft.name.trim() || typeLabel(draft.type),
      institution: draft.institution.trim(),
      linkedAssetId: draft.linkedAssetId,
      principal: Math.max(0, draft.principal),
      outstandingBalance: Math.max(0, draft.outstandingBalance),
      annualInterestRatePercent: Math.max(0, draft.annualInterestRatePercent),
      monthlyPayment: Math.max(0, draft.monthlyPayment),
      borrowedAt: draft.borrowedAt,
      maturityDate: draft.maturityDate || null,
      isActive: draft.isActive,
      notes: draft.notes.trim(),
      createdAt: liability?.createdAt ?? time,
      updatedAt: time,
    })
    onClose()
  }

  return (
    <div className="modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose() }}>
      <div className="modal-card loan-modal-card" role="dialog" aria-modal="true" aria-labelledby="liability-modal-title">
        <div className="modal-header"><div><div className="section-kicker">一般負債資料</div><h2 id="liability-modal-title">{liability ? '編輯一般負債' : '新增一般負債'}</h2><p>「原始本金」是最初借款額；「剩餘本金」是目前尚未償還、現在還欠銀行的金額。</p></div><button type="button" className="icon-button" aria-label="關閉視窗" onClick={onClose}><X size={19} /></button></div>
        <form className="asset-form" onSubmit={(event) => void handleSubmit(event)}>
          <div className="form-grid form-grid-two">
            <FormField label="負債名稱"><input required value={draft.name} onChange={(event) => setDraft((current) => ({ ...current, name: event.target.value }))} placeholder="例如 自住房房貸" /></FormField>
            <FormField label="負債類型"><div className="select-wrap"><select value={draft.type} onChange={(event) => setDraft((current) => ({ ...current, type: event.target.value as LiabilityType }))}>{liabilityTypes.map((item) => <option value={item.value} key={item.value}>{item.label}</option>)}</select><SelectChevron /></div></FormField>
            <FormField label="金融機構"><input value={draft.institution} onChange={(event) => setDraft((current) => ({ ...current, institution: event.target.value }))} placeholder="例如 XX 銀行" /></FormField>
            <FormField label="連結房產" hint="可留空"><div className="select-wrap"><select value={draft.linkedAssetId ?? ''} onChange={(event) => setDraft((current) => ({ ...current, linkedAssetId: event.target.value || null }))}><option value="">不連結房產</option>{realEstate.map((asset) => <option value={asset.id} key={asset.id}>{asset.name}</option>)}</select><SelectChevron /></div></FormField>
            <FormField label="原始本金" hint="TWD"><input required min="0" step="any" type="number" value={draft.principal || ''} onChange={(event) => setDraft((current) => ({ ...current, principal: Number(event.target.value) }))} placeholder="0" /></FormField>
            <FormField label="剩餘本金（目前尚欠）" hint="TWD"><input required min="0" step="any" type="number" value={draft.outstandingBalance || ''} onChange={(event) => setDraft((current) => ({ ...current, outstandingBalance: Number(event.target.value) }))} placeholder="0" /></FormField>
            <FormField label="年利率" hint="%"><input min="0" step="0.01" type="number" value={draft.annualInterestRatePercent || ''} onChange={(event) => setDraft((current) => ({ ...current, annualInterestRatePercent: Number(event.target.value) }))} placeholder="例如 2.2" /></FormField>
            <FormField label="每月付款" hint="TWD／本金＋利息"><input required min="0" step="any" type="number" value={draft.monthlyPayment || ''} onChange={(event) => setDraft((current) => ({ ...current, monthlyPayment: Number(event.target.value) }))} placeholder="例如 35,000" /></FormField>
            <FormField label="開始日期"><input required type="date" value={draft.borrowedAt} onChange={(event) => setDraft((current) => ({ ...current, borrowedAt: event.target.value }))} /></FormField>
            <FormField label="到期日" hint="可留空"><input type="date" value={draft.maturityDate} onChange={(event) => setDraft((current) => ({ ...current, maturityDate: event.target.value }))} /></FormField>
          </div>
          <label className="checkbox-field"><input type="checkbox" checked={draft.isActive} onChange={(event) => setDraft((current) => ({ ...current, isActive: event.target.checked }))} /><span className="custom-checkbox"><Check size={13} /></span><span>計入目前負債與每月支出</span></label>
          <FormField label="備註" wide><textarea value={draft.notes} onChange={(event) => setDraft((current) => ({ ...current, notes: event.target.value }))} placeholder="例如 寬限期、扣款日或利率調整方式" rows={3} /></FormField>
          <div className="modal-actions"><button type="button" className="button button-ghost" onClick={onClose}>取消</button><button type="submit" className="button button-primary"><Check size={16} />儲存負債</button></div>
        </form>
      </div>
    </div>
  )
}

export function GeneralLiabilitiesPanel({ liabilities, realEstate, displayMode, onSave, onDelete }: GeneralLiabilitiesPanelProps) {
  const [modalOpen, setModalOpen] = useState(false)
  const [editing, setEditing] = useState<Liability | null>(null)
  const activeLiabilities = liabilities.filter((item) => item.isActive)
  const totalBalance = activeLiabilities.reduce((total, item) => total + Math.max(0, item.outstandingBalance), 0)
  const monthlyPayment = activeLiabilities.reduce((total, item) => total + Math.max(0, item.monthlyPayment), 0)

  const openNew = () => {
    setEditing(null)
    setModalOpen(true)
  }

  const openEdit = (liability: Liability) => {
    setEditing(liability)
    setModalOpen(true)
  }

  const handleDelete = (liability: Liability) => {
    if (window.confirm(`確定要刪除「${liability.name}」嗎？`)) void onDelete(liability.id)
  }

  return (
    <div className="liability-panel">
      <section className="card risk-overview-card">
        <div className="risk-overview-top"><div><div className="section-kicker">家庭負債總覽</div><h2>房貸與一般負債，完整放進家庭資產負債表。</h2><p className="risk-overview-description">剩餘本金會從總資產扣除；每月付款會自動加入現金流，不需要再重複手動登錄。</p></div><div className="risk-overview-ratio"><div className="risk-overview-ratio-label"><Landmark size={16} />每月負債支出</div><strong className="risk-overview-value">{formatTwd(monthlyPayment, displayMode)}</strong><span className="risk-badge status-warning">{activeLiabilities.length} 筆啟用中</span></div></div>
        <div className="risk-overview-stats"><div className="risk-overview-stat"><span>一般負債剩餘本金</span><strong>{formatTwd(totalBalance, displayMode)}</strong></div><div className="risk-overview-stat"><span>每月付款</span><strong>{formatTwd(monthlyPayment, displayMode)}</strong></div><div className="risk-overview-stat"><span>房貸筆數</span><strong>{activeLiabilities.filter((item) => item.type === 'mortgage').length} 筆</strong></div><div className="risk-overview-stat"><span>未計入筆數</span><strong>{liabilities.length - activeLiabilities.length} 筆</strong></div></div>
      </section>

      <section className="section-heading-row loan-list-heading"><div><div className="section-kicker">一般負債清單</div><h2>每月固定付款，清楚知道流向。</h2></div><button type="button" className="button button-primary" onClick={openNew}><Plus size={17} />新增一般負債</button></section>

      {liabilities.length === 0 ? <section className="card empty-card"><div className="empty-state"><div className="empty-state-icon"><House size={23} /></div><h3>還沒有一般負債</h3><p>新增目前房貸、車貸、信貸或其他固定還款，系統就能估算每月支出。</p><button type="button" className="button button-secondary" onClick={openNew}><Plus size={15} />新增房貸／負債</button></div></section> : <div className="loan-list">
        {liabilities.map((liability) => {
          const linkedProperty = realEstate.find((asset) => asset.id === liability.linkedAssetId)
          return <article className={`card loan-card ${!liability.isActive ? 'is-paused' : ''}`} key={liability.id}>
            <div className="loan-card-header"><div className="loan-card-title"><span className="loan-card-icon"><>{liability.type === 'mortgage' ? <House size={17} /> : <Landmark size={17} />}</></span><div><h3>{liability.name}</h3><small>{typeLabel(liability.type)} · {liability.institution || '未填寫金融機構'}{!liability.isActive ? ' · 已停用' : ''}</small></div></div><div className="loan-card-balance"><small>剩餘本金（目前尚欠）</small><strong>{formatTwd(liability.outstandingBalance, displayMode)}</strong></div><div className="loan-card-actions"><button type="button" className="button button-ghost" onClick={() => openEdit(liability)}><Edit3 size={14} />編輯</button><button type="button" className="icon-button small danger-hover" aria-label={`刪除 ${liability.name}`} onClick={() => handleDelete(liability)}><Trash2 size={15} /></button></div></div>
            <div className="loan-card-stats"><div><span>每月付款</span><strong>{formatTwd(liability.monthlyPayment, displayMode)}</strong></div><div><span>年利率</span><strong>{formatPercent(liability.annualInterestRatePercent)}</strong></div><div><span>原始本金</span><strong>{formatTwd(liability.principal, displayMode)}</strong></div><div><span>開始日期</span><strong>{liability.borrowedAt || '—'}</strong></div></div>
            <div className="loan-card-collateral"><div className="section-kicker">連結資產</div><div className="loan-collateral-row"><div><strong>{linkedProperty?.name ?? '未連結房產'}</strong><span>{linkedProperty ? `房產估值 ${formatTwd(linkedProperty.currentValueTwd, displayMode)}` : '可在編輯時連結房產'}</span></div><div><strong>{liability.isActive ? '計入月支出' : '未計入'}</strong><span>{liability.notes || '—'}</span></div></div></div>
          </article>
        })}
      </div>}

      {modalOpen && <LiabilityModal liability={editing} realEstate={realEstate} onClose={() => setModalOpen(false)} onSave={onSave} />}
    </div>
  )
}
