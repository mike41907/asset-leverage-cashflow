import { useMemo, useState, type FormEvent } from 'react'
import { ArrowDownRight, ArrowUpRight, Check, CircleDollarSign, Edit3, Info, Plus, ReceiptText, Trash2, X } from 'lucide-react'
import type { CashFlowFrequency, CashFlowItem, CashFlowType, DividendTarget, Liability, Loan, StockAsset } from '../domain/models'
import { calculateCashFlowItemMonthlyAmount, calculateCashFlowMonthlyAmount, calculateMonthlyCashFlowBreakdown, type PortfolioSummary } from '../domain/calculations'
import { formatCurrencyWithSign, formatTwd } from '../shared/formatters'
import { createId } from '../shared/id'
import { PassiveIncomeTarget } from '../components/PassiveIncomeTarget'

interface CashFlowPageProps {
  items: CashFlowItem[]
  loans: Loan[]
  liabilities: Liability[]
  stocks: StockAsset[]
  targets: DividendTarget[]
  summary: PortfolioSummary
  displayMode: 'exact' | 'compact'
  onSaveItem: (item: CashFlowItem) => Promise<void>
  onDeleteItem: (item: CashFlowItem) => Promise<void>
  onSaveTarget: (target: DividendTarget) => Promise<void>
  onDeleteTarget: (target: DividendTarget) => Promise<void>
}

interface CashFlowDraft {
  type: CashFlowType
  category: string
  name: string
  amount: number
  frequency: CashFlowFrequency
  notes: string
  isActive: boolean
}

const cashFlowFrequencyOptions: { value: CashFlowFrequency; label: string; amountLabel: string; description: string }[] = [
  { value: 'monthly', label: '每月', amountLabel: '每月金額', description: '每月直接計入現金流' },
  { value: 'quarterly', label: '每季', amountLabel: '每季金額', description: '每季金額 ÷ 3，換算每月' },
  { value: 'semiannual', label: '每半年', amountLabel: '每半年金額', description: '半年金額 ÷ 6，換算每月' },
  { value: 'annual', label: '每年', amountLabel: '每年金額', description: '年度金額 ÷ 12，換算每月' },
]

const incomeCategories = ['薪資', '租金', '利息收入', '其他收入']
const expenseCategories = ['房貸', '捐款', '稅費', '車貸', '信貸', '保險', '固定生活費', '醫療', '教育', '其他支出']

function categoriesFor(type: CashFlowType): string[] {
  return type === 'income' ? incomeCategories : expenseCategories
}

function createDraft(item: CashFlowItem | null, initialType: CashFlowType): CashFlowDraft {
  const type = item?.type ?? initialType
  return {
    type,
    category: item?.category ?? categoriesFor(type)[0],
    name: item?.name ?? '',
    amount: item?.amount ?? item?.monthlyAmount ?? 0,
    frequency: item?.frequency ?? 'monthly',
    notes: item?.notes ?? '',
    isActive: item?.isActive ?? true,
  }
}

function frequencyOption(frequency: CashFlowFrequency) {
  return cashFlowFrequencyOptions.find((option) => option.value === frequency) ?? cashFlowFrequencyOptions[0]
}

function typeLabel(type: CashFlowType): string {
  return type === 'income' ? '收入' : '支出'
}

function formatSignedAmount(value: number, displayMode: 'exact' | 'compact'): string {
  return value === 0 ? formatTwd(0, displayMode) : formatCurrencyWithSign(value, displayMode)
}

function formatFrequencySummary(frequency: CashFlowFrequency | undefined): string {
  const option = frequencyOption(frequency ?? 'monthly')
  return option.value === 'monthly' ? '每月' : `${option.label} ÷ ${option.value === 'quarterly' ? 3 : option.value === 'semiannual' ? 6 : 12}`
}

function CashFlowItemRow({ item, displayMode, onEdit, onDelete, onToggle }: { item: CashFlowItem; displayMode: 'exact' | 'compact'; onEdit: () => void; onDelete: () => void; onToggle: () => void }) {
  const isIncome = item.type === 'income'
  const monthlyAmount = calculateCashFlowItemMonthlyAmount(item)
  return (
    <article className={`cashflow-item-row ${!item.isActive ? 'is-paused' : ''}`}>
      <button type="button" className="cashflow-item-toggle" aria-pressed={item.isActive} aria-label={`${item.name || item.category}${item.isActive ? '已啟用' : '已停用'}`} onClick={onToggle}>
        <span className="cashflow-toggle-track"><span /></span>
      </button>
      <div className="cashflow-item-main"><div className="cashflow-item-title"><strong>{item.name || item.category}</strong>{!item.isActive && <span className="cashflow-paused-badge">已停用</span>}</div><small>{item.category}{item.notes ? ` · ${item.notes}` : ''}</small></div>
      <div className="cashflow-item-amount-wrap"><strong className={`cashflow-item-amount ${isIncome ? 'positive-text' : 'negative-text'}`}>{isIncome ? '+' : '-'}{formatTwd(monthlyAmount, displayMode)}</strong><small className="cashflow-item-amount-note">{formatFrequencySummary(item.frequency)}</small></div>
      <div className="cashflow-item-actions"><button type="button" className="icon-button small" aria-label={`編輯 ${item.name || item.category}`} onClick={onEdit}><Edit3 size={14} /></button><button type="button" className="icon-button small danger-hover" aria-label={`刪除 ${item.name || item.category}`} onClick={onDelete}><Trash2 size={14} /></button></div>
    </article>
  )
}

function CashFlowList({ type, items, displayMode, onAdd, onEdit, onDelete, onToggle }: { type: CashFlowType; items: CashFlowItem[]; displayMode: 'exact' | 'compact'; onAdd: () => void; onEdit: (item: CashFlowItem) => void; onDelete: (item: CashFlowItem) => void; onToggle: (item: CashFlowItem) => void }) {
  const filteredItems = items.filter((item) => item.type === type)
  const isIncome = type === 'income'
  return (
    <section className={`card cashflow-list-card cashflow-list-${type}`}>
      <div className="section-heading-row"><div><div className="section-kicker">{isIncome ? '手動收入' : '手動支出'}</div><h2>{isIncome ? '收入項目' : '支出項目'}</h2></div><button type="button" className="text-button" onClick={onAdd}><Plus size={15} />新增{typeLabel(type)}</button></div>
      {filteredItems.length === 0 ? <div className="cashflow-list-empty"><ReceiptText size={21} /><strong>還沒有{typeLabel(type)}項目</strong><span>{isIncome ? '新增固定收入。' : '新增固定支出。'}</span><button type="button" className="button button-secondary" onClick={onAdd}><Plus size={15} />新增{typeLabel(type)}</button></div> : <div className="cashflow-item-list">{filteredItems.map((item) => <CashFlowItemRow key={item.id} item={item} displayMode={displayMode} onEdit={() => onEdit(item)} onDelete={() => onDelete(item)} onToggle={() => onToggle(item)} />)}</div>}
    </section>
  )
}

function CashFlowItemModal({ item, initialType, displayMode, onClose, onSave }: { item: CashFlowItem | null; initialType: CashFlowType; displayMode: 'exact' | 'compact'; onClose: () => void; onSave: (item: CashFlowItem) => Promise<void> }) {
  const [draft, setDraft] = useState<CashFlowDraft>(() => createDraft(item, initialType))
  const categories = categoriesFor(draft.type)
  const categoryOptions = categories.includes(draft.category) ? categories : [draft.category, ...categories]
  const selectedFrequency = frequencyOption(draft.frequency)
  const monthlyEquivalent = calculateCashFlowMonthlyAmount(draft.amount, draft.frequency)

  const changeType = (type: CashFlowType) => setDraft((current) => ({ ...current, type, category: categoriesFor(type)[0] }))

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    const time = new Date().toISOString()
    const amount = Math.max(0, draft.amount)
    await onSave({
      id: item?.id ?? createId('cashflow'),
      type: draft.type,
      category: draft.category,
      name: draft.name.trim(),
      amount,
      frequency: draft.frequency,
      monthlyAmount: calculateCashFlowMonthlyAmount(amount, draft.frequency),
      linkedAssetId: item?.linkedAssetId ?? null,
      isActive: draft.isActive,
      notes: draft.notes.trim(),
      createdAt: item?.createdAt ?? time,
      updatedAt: time,
    })
    onClose()
  }

  return (
    <div className="modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose() }}>
      <div className="modal-card cashflow-modal-card" role="dialog" aria-modal="true" aria-labelledby="cashflow-modal-title">
        <div className="modal-header"><div><div className="section-kicker">本機現金流資料</div><h2 id="cashflow-modal-title">{item ? '編輯現金流項目' : '新增現金流項目'}</h2></div><button type="button" className="icon-button" aria-label="關閉視窗" onClick={onClose}><X size={19} /></button></div>
        <form className="asset-form" onSubmit={(event) => void handleSubmit(event)}>
          <div className="cashflow-type-switch" role="radiogroup" aria-label="現金流類型"><button type="button" role="radio" aria-checked={draft.type === 'income'} className={draft.type === 'income' ? 'is-active' : ''} onClick={() => changeType('income')}><ArrowDownRight size={15} />收入</button><button type="button" role="radio" aria-checked={draft.type === 'expense'} className={draft.type === 'expense' ? 'is-active' : ''} onClick={() => changeType('expense')}><ArrowUpRight size={15} />支出</button></div>
          <div className="form-grid form-grid-two"><label className="form-field"><span>項目名稱</span><input required value={draft.name} placeholder={draft.type === 'income' ? '例如 正職薪資' : '例如 保險費或所得稅'} onChange={(event) => setDraft((current) => ({ ...current, name: event.target.value }))} /></label><label className="form-field"><span>分類</span><div className="select-wrap"><select value={draft.category} onChange={(event) => setDraft((current) => ({ ...current, category: event.target.value }))}>{categoryOptions.map((category) => <option value={category} key={category}>{category}</option>)}</select><span className="select-chevron">⌄</span></div></label><label className="form-field"><span>{selectedFrequency.amountLabel}<small>NTD</small></span><input required min="0" step="1" type="number" value={draft.amount || ''} placeholder="0" onChange={(event) => setDraft((current) => ({ ...current, amount: Number(event.target.value) }))} /></label><label className="form-field"><span>發生週期</span><div className="select-wrap"><select value={draft.frequency} onChange={(event) => setDraft((current) => ({ ...current, frequency: event.target.value as CashFlowFrequency }))}>{cashFlowFrequencyOptions.map((option) => <option value={option.value} key={option.value}>{option.label}</option>)}</select><span className="select-chevron">⌄</span></div></label><div className="cashflow-frequency-preview form-field-wide"><span>每月計入現金流</span><strong>{formatTwd(monthlyEquivalent, displayMode)}</strong><small>{selectedFrequency.description}</small></div><label className="form-field form-field-wide"><span>備註<small>選填</small></span><textarea rows={3} value={draft.notes} placeholder="例如 繳費月份、到期日或調整週期" onChange={(event) => setDraft((current) => ({ ...current, notes: event.target.value }))} /></label></div>
          <label className="checkbox-field cashflow-active-field"><input type="checkbox" checked={draft.isActive} onChange={(event) => setDraft((current) => ({ ...current, isActive: event.target.checked }))} /><span className="custom-checkbox"><Check size={13} /></span><span>計入每月現金流</span></label>
          <div className="modal-actions"><button type="button" className="button button-ghost" onClick={onClose}>取消</button><button type="submit" className="button button-primary"><Check size={15} />儲存{typeLabel(draft.type)}</button></div>
        </form>
      </div>
    </div>
  )
}

export function CashFlowPage({ items, loans, liabilities, stocks, targets, summary, displayMode, onSaveItem, onDeleteItem, onSaveTarget, onDeleteTarget }: CashFlowPageProps) {
  const [modalOpen, setModalOpen] = useState(false)
  const [editingItem, setEditingItem] = useState<CashFlowItem | null>(null)
  const [newItemType, setNewItemType] = useState<CashFlowType>('income')
  const [activeView, setActiveView] = useState<'cashflow' | 'target'>('cashflow')
  const breakdown = useMemo(() => calculateMonthlyCashFlowBreakdown(items, summary.monthlyEstimatedDividendTwd, summary.monthlyLoanInterestTwd, summary.monthlyLoanPrincipalTwd, summary.monthlyLiabilityPaymentTwd, summary.monthlyRentalIncomeTwd), [items, summary.monthlyEstimatedDividendTwd, summary.monthlyLoanInterestTwd, summary.monthlyLoanPrincipalTwd, summary.monthlyLiabilityPaymentTwd, summary.monthlyRentalIncomeTwd])

  const openNew = (type: CashFlowType) => {
    setEditingItem(null)
    setNewItemType(type)
    setModalOpen(true)
  }

  const openEdit = (item: CashFlowItem) => {
    setEditingItem(item)
    setNewItemType(item.type)
    setModalOpen(true)
  }

  const handleToggle = (item: CashFlowItem) => {
    void onSaveItem({ ...item, isActive: !item.isActive, updatedAt: new Date().toISOString() })
  }

  const handleDelete = (item: CashFlowItem) => {
    if (window.confirm(`確定要刪除「${item.name || item.category}」嗎？`)) void onDeleteItem(item)
  }

  return (
    <div className="page-container cashflow-page">
      <section className="page-heading cashflow-toolbar">
        <div className="heading-actions"><div className="segmented-control cashflow-view-switch" role="tablist" aria-label="現金流功能"><button type="button" role="tab" aria-selected={activeView === 'cashflow'} className={activeView === 'cashflow' ? 'is-active' : ''} onClick={() => setActiveView('cashflow')}>月現金流</button><button type="button" role="tab" aria-selected={activeView === 'target'} className={activeView === 'target' ? 'is-active' : ''} onClick={() => setActiveView('target')}>被動收入目標</button></div>{activeView === 'cashflow' && <button type="button" className="button button-primary" onClick={() => openNew('income')}><Plus size={17} />新增現金流</button>}</div>
      </section>

      {activeView === 'target' ? <PassiveIncomeTarget stocks={stocks} summary={summary} targets={targets} displayMode={displayMode} onSaveTarget={onSaveTarget} onDeleteTarget={onDeleteTarget} /> : <>
      <section className={`card cashflow-hero-card ${breakdown.netCashFlowTwd >= 0 ? 'is-positive' : 'is-negative'}`}>
        <div className="cashflow-hero-main"><div className="section-kicker">每月自由現金流</div><div className="cashflow-hero-value">{formatCurrencyWithSign(breakdown.netCashFlowTwd, displayMode)}</div></div>
        <div className="cashflow-summary-grid"><div><span>每月總收入</span><strong className="positive-text">{formatTwd(breakdown.totalIncomeTwd, displayMode)}</strong><small>手動收入＋股息＋房租</small></div><div><span>投資收入</span><strong className="positive-text">{formatTwd(breakdown.investmentIncomeTwd + breakdown.rentalIncomeTwd, displayMode)}</strong><small>股票股息＋房租</small></div><div><span>每月總支出</span><strong className="negative-text">{formatTwd(breakdown.totalExpenseTwd, displayMode)}</strong><small>固定支出＋借款付款</small></div><div><span>借款成本</span><strong className="negative-text">{formatTwd(breakdown.loanInterestTwd + breakdown.loanPrincipalTwd + breakdown.liabilityPaymentTwd, displayMode)}</strong><small>質押＋房貸／負債</small></div></div>
      </section>

      <section className="card cashflow-system-card">
        <div className="section-heading-row"><div><div className="section-kicker">系統自動帶入</div><h2>股息、借款與房貸</h2></div><CircleDollarSign size={19} className="cashflow-system-icon" /></div>
        <div className="cashflow-system-grid"><div className="cashflow-system-item system-income"><span>股票／ETF 股息</span><strong>{formatSignedAmount(breakdown.investmentIncomeTwd, displayMode)}</strong><small>年度預估股息 ÷ 12</small></div><div className="cashflow-system-item system-income"><span>房租收入</span><strong>{formatSignedAmount(breakdown.rentalIncomeTwd, displayMode)}</strong><small>依房產每月租金設定</small></div><div className="cashflow-system-item system-expense"><span>質押利息</span><strong>{formatSignedAmount(-breakdown.loanInterestTwd, displayMode)}</strong><small>{loans.length > 0 ? `目前 ${loans.length} 筆借款` : '尚未建立借款'}</small></div><div className="cashflow-system-item system-expense"><span>質押本金</span><strong>{formatSignedAmount(-breakdown.loanPrincipalTwd, displayMode)}</strong><small>依借款設定的每月本金</small></div><div className="cashflow-system-item system-expense"><span>一般負債／房貸</span><strong>{formatSignedAmount(-breakdown.liabilityPaymentTwd, displayMode)}</strong><small>{liabilities.filter((item) => item.isActive).length > 0 ? `目前 ${liabilities.filter((item) => item.isActive).length} 筆啟用中` : '尚未建立房貸或一般負債'}</small></div></div>
        {(loans.length > 0 || liabilities.some((item) => item.isActive)) && <div className="cashflow-system-note"><Info size={15} /><span>借款與房貸付款已自動計入，請勿重複新增。</span></div>}
      </section>

      <div className="cashflow-lists-grid"><CashFlowList type="income" items={items} displayMode={displayMode} onAdd={() => openNew('income')} onEdit={openEdit} onDelete={handleDelete} onToggle={handleToggle} /><CashFlowList type="expense" items={items} displayMode={displayMode} onAdd={() => openNew('expense')} onEdit={openEdit} onDelete={handleDelete} onToggle={handleToggle} /></div>

      {modalOpen && <CashFlowItemModal key={editingItem?.id ?? `new-${newItemType}`} item={editingItem} initialType={newItemType} displayMode={displayMode} onClose={() => setModalOpen(false)} onSave={onSaveItem} />}
      </>}
    </div>
  )
}
