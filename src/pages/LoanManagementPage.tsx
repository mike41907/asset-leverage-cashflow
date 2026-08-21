import { useMemo, useState, type FormEvent, type ReactNode } from 'react'
import {
  AlertTriangle,
  Banknote,
  Check,
  ChevronDown,
  Edit3,
  Info,
  Landmark,
  Plus,
  ShieldCheck,
  Trash2,
  X,
} from 'lucide-react'
import type { AppSettings, Collateral, Liability, Loan, RealEstateAsset, RepaymentMethod, Simulation, StockAsset } from '../domain/models'
import {
  calculateCollateralSelectionsValueTwd,
  calculateCollateralValueTwd,
  calculateMaintenanceOverview,
  calculateMonthlyLoanInterest,
  calculateTotalCollateralValueTwd,
  type MaintenanceStatus,
  type PortfolioSummary,
} from '../domain/calculations'
import { formatNumber, formatPercent, formatTwd } from '../shared/formatters'
import { createId } from '../shared/id'
import { EmptyState } from '../components/EmptyState'
import { ReinvestmentSimulator } from '../components/ReinvestmentSimulator'
import { StressTestPanel } from '../components/StressTestPanel'
import { ScenarioComparison } from '../components/ScenarioComparison'
import { GeneralLiabilitiesPanel } from '../components/GeneralLiabilitiesPanel'

interface LoanManagementPageProps {
  stocks: StockAsset[]
  loans: Loan[]
  liabilities: Liability[]
  realEstate: RealEstateAsset[]
  collaterals: Collateral[]
  simulations: Simulation[]
  settings: AppSettings
  summary: PortfolioSummary
  displayMode: 'exact' | 'compact'
  onSaveLoan: (loan: Loan, collaterals: Collateral[], removedCollateralIds: string[]) => Promise<void>
  onDeleteLoan: (loan: Loan) => Promise<void>
  onSaveLiability: (liability: Liability) => Promise<void>
  onDeleteLiability: (id: string) => Promise<void>
  onSaveSimulation: (simulation: Simulation) => Promise<void>
  onDeleteSimulation: (simulation: Simulation) => Promise<void>
}

interface LoanCollateralDraft {
  id?: string
  stockAssetId: string
  pledgedShares: number
}

interface LoanDraft {
  name: string
  institution: string
  principal: number
  outstandingBalance: number
  annualInterestRatePercent: number
  borrowedAt: string
  maturityDate: string
  repaymentMethod: RepaymentMethod
  monthlyPrincipal: number
  warningRatioPercent: number
  marginCallRatioPercent: number
  notes: string
  selectedCollaterals: LoanCollateralDraft[]
}

function todayInputValue(): string {
  return new Date().toISOString().slice(0, 10)
}

function createDefaultLoanDraft(): LoanDraft {
  return {
    name: '',
    institution: '',
    principal: 0,
    outstandingBalance: 0,
    annualInterestRatePercent: 0,
    borrowedAt: todayInputValue(),
    maturityDate: '',
    repaymentMethod: 'interest-only',
    monthlyPrincipal: 0,
    warningRatioPercent: 160,
    marginCallRatioPercent: 120,
    notes: '',
    selectedCollaterals: [],
  }
}

function statusLabel(status: MaintenanceStatus): string {
  if (status === 'safe') return '安全'
  if (status === 'warning') return '警戒'
  if (status === 'danger') return '追繳風險'
  return '尚無法判讀'
}

function statusDescription(status: MaintenanceStatus): string {
  if (status === 'safe') return '目前高於警戒線，仍請持續更新股價。'
  if (status === 'warning') return '已進入警戒區，建議檢查可用現金與還款安排。'
  if (status === 'danger') return '低於追繳線，請優先檢查借款與擔保品配置。'
  return '建立借款與擔保品後，這裡會顯示維持率。'
}

function statusIcon(status: MaintenanceStatus) {
  return status === 'safe' ? ShieldCheck : AlertTriangle
}

function statusClass(status: MaintenanceStatus): string {
  return `status-${status}`
}

function riskMeterWidth(ratioPercent: number, warningRatioPercent: number): number {
  if (ratioPercent === Number.POSITIVE_INFINITY) return 100
  if (!Number.isFinite(ratioPercent)) return 0
  const ceiling = warningRatioPercent > 0 ? warningRatioPercent : 160
  return Math.min(100, Math.max(0, (ratioPercent / ceiling) * 100))
}

function maintenanceRatioLabel(ratioPercent: number, status: MaintenanceStatus): string {
  return status === 'unavailable' ? '—' : formatPercent(ratioPercent)
}

function FormField({ label, hint, children, wide = false }: { label: string; hint?: string; children: ReactNode; wide?: boolean }) {
  return <label className={`form-field ${wide ? 'form-field-wide' : ''}`}><span>{label}{hint && <small>{hint}</small>}</span>{children}</label>
}

function SelectChevron() {
  return <ChevronDown className="select-chevron" size={16} aria-hidden="true" />
}

function Modal({ title, description, onClose, children }: { title: string; description: string; onClose: () => void; children: ReactNode }) {
  return (
    <div className="modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose() }}>
      <div className="modal-card loan-modal-card" role="dialog" aria-modal="true" aria-labelledby="loan-modal-title">
        <div className="modal-header">
          <div><div className="section-kicker">質押借款資料</div><h2 id="loan-modal-title">{title}</h2><p>{description}</p></div>
          <button type="button" className="icon-button" aria-label="關閉視窗" onClick={onClose}><X size={19} /></button>
        </div>
        {children}
      </div>
    </div>
  )
}

function loanDraftFrom(loan: Loan, collaterals: Collateral[]): LoanDraft {
  return {
    name: loan.name,
    institution: loan.institution,
    principal: loan.principal,
    outstandingBalance: loan.outstandingBalance,
    annualInterestRatePercent: loan.annualInterestRatePercent,
    borrowedAt: loan.borrowedAt,
    maturityDate: loan.maturityDate ?? '',
    repaymentMethod: loan.repaymentMethod,
    monthlyPrincipal: loan.monthlyPrincipal,
    warningRatioPercent: loan.warningRatioPercent,
    marginCallRatioPercent: loan.marginCallRatioPercent,
    notes: loan.notes,
    selectedCollaterals: loan.collateralIds
      .map((id) => collaterals.find((collateral) => collateral.id === id))
      .filter((collateral): collateral is Collateral => Boolean(collateral))
      .map((collateral) => ({ id: collateral.id, stockAssetId: collateral.stockAssetId, pledgedShares: collateral.pledgedShares })),
  }
}

export function LoanManagementPage({ stocks, loans, liabilities, realEstate, collaterals, simulations, settings, summary, displayMode, onSaveLoan, onDeleteLoan, onSaveLiability, onDeleteLiability, onSaveSimulation, onDeleteSimulation }: LoanManagementPageProps) {
  const [activeView, setActiveView] = useState<'simulation' | 'stress' | 'loans' | 'liabilities' | 'scenarios'>('simulation')
  const [modalOpen, setModalOpen] = useState(false)
  const [editingLoan, setEditingLoan] = useState<Loan | null>(null)
  const [draft, setDraft] = useState<LoanDraft>(createDefaultLoanDraft)

  const linkedCollateralIds = useMemo(() => new Set(loans.flatMap((loan) => loan.collateralIds)), [loans])
  const activeCollaterals = useMemo(() => collaterals.filter((collateral) => linkedCollateralIds.has(collateral.id)), [collaterals, linkedCollateralIds])
  const totalLoanBalance = loans.reduce((total, loan) => total + Math.max(0, loan.outstandingBalance), 0)
  const totalCollateralValue = calculateTotalCollateralValueTwd(activeCollaterals, stocks)
  const overview = calculateMaintenanceOverview(
    totalCollateralValue,
    totalLoanBalance,
    settings.maintenanceWarningRatioPercent,
    settings.maintenanceMarginCallRatioPercent,
  )
  const selectedCollateralValue = calculateCollateralSelectionsValueTwd(draft.selectedCollaterals, stocks)
  const draftOverview = calculateMaintenanceOverview(
    selectedCollateralValue,
    draft.outstandingBalance,
    draft.warningRatioPercent,
    draft.marginCallRatioPercent,
  )
  const OverviewIcon = statusIcon(overview.status)
  const DraftOverviewIcon = statusIcon(draftOverview.status)

  const openNewLoan = () => {
    setEditingLoan(null)
    setDraft(createDefaultLoanDraft())
    setModalOpen(true)
  }

  const openEditLoan = (loan: Loan) => {
    setEditingLoan(loan)
    setDraft(loanDraftFrom(loan, collaterals))
    setModalOpen(true)
  }

  const toggleCollateral = (stock: StockAsset) => {
    setDraft((current) => {
      const existing = current.selectedCollaterals.find((item) => item.stockAssetId === stock.id)
      return {
        ...current,
        selectedCollaterals: existing
          ? current.selectedCollaterals.filter((item) => item.stockAssetId !== stock.id)
          : [...current.selectedCollaterals, { stockAssetId: stock.id, pledgedShares: stock.shares }],
      }
    })
  }

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    const time = new Date().toISOString()
    const newCollaterals = draft.selectedCollaterals.map((selection) => {
      const existing = selection.id ? collaterals.find((collateral) => collateral.id === selection.id) : undefined
      const stock = stocks.find((item) => item.id === selection.stockAssetId)
      return {
        id: selection.id ?? createId('collateral'),
        name: `${draft.name.trim() || '質押借款'}・${stock?.symbol ?? '股票'}`,
        institution: draft.institution.trim(),
        stockAssetId: selection.stockAssetId,
        pledgedShares: Math.max(0, selection.pledgedShares),
        maintenanceFormula: 'market-value-over-loan' as const,
        warningRatioPercent: draft.warningRatioPercent,
        marginCallRatioPercent: draft.marginCallRatioPercent,
        notes: '',
        createdAt: existing?.createdAt ?? time,
        updatedAt: time,
      }
    })
    const loan: Loan = {
      id: editingLoan?.id ?? createId('loan'),
      name: draft.name.trim(),
      institution: draft.institution.trim(),
      collateralIds: newCollaterals.map((collateral) => collateral.id),
      principal: Math.max(0, draft.principal),
      outstandingBalance: Math.max(0, draft.outstandingBalance),
      annualInterestRatePercent: Math.max(0, draft.annualInterestRatePercent),
      borrowedAt: draft.borrowedAt,
      maturityDate: draft.maturityDate || null,
      repaymentMethod: draft.repaymentMethod,
      monthlyPrincipal: Math.max(0, draft.monthlyPrincipal),
      monthlyInterest: calculateMonthlyLoanInterest(draft.outstandingBalance, draft.annualInterestRatePercent),
      warningRatioPercent: Math.max(1, draft.warningRatioPercent),
      marginCallRatioPercent: Math.max(1, draft.marginCallRatioPercent),
      notes: draft.notes.trim(),
      createdAt: editingLoan?.createdAt ?? time,
      updatedAt: time,
    }
    const removedCollateralIds = editingLoan?.collateralIds.filter((id) => !newCollaterals.some((collateral) => collateral.id === id)) ?? []
    await onSaveLoan(loan, newCollaterals, removedCollateralIds)
    setModalOpen(false)
  }

  const handleDelete = async (loan: Loan) => {
    if (window.confirm(`確定要刪除「${loan.name || '這筆質押借款'}」嗎？`)) await onDeleteLoan(loan)
  }

  return (
    <div className="page-container loan-page">
      <section className="page-heading">
        <div>
          <div className="eyebrow"><span className="eyebrow-mark" />{activeView === 'simulation' ? '投資模擬 / V0.3' : activeView === 'stress' ? '市場壓力測試 / V0.4' : activeView === 'scenarios' ? '多情境比較 / V0.7' : activeView === 'liabilities' ? '家庭負債 / V1.2' : '質押風控 / V0.2'}</div>
          <h1>{activeView === 'simulation' ? <>借款先試算，<span>再決定要不要放大。</span></> : activeView === 'stress' ? <>先問最壞情境，<span>再決定槓桿上限。</span></> : activeView === 'scenarios' ? <>不要只看一個答案，<span>把方案放在同一張表。</span></> : activeView === 'liabilities' ? <>把家庭負債，<span>放進每月現金流。</span></> : <>把槓桿，<span>放在可控範圍內。</span></>}</h1>
          <p>{activeView === 'simulation' ? '把質押借款投入股票，先比較操作前後的資產、負債、槓桿與現金流。' : activeView === 'stress' ? '把市場跌幅套入目前資產，先看懂維持率與淨資產的風險距離。' : activeView === 'scenarios' ? '保存不同借款與投資配置，並比較年度股息、每月現金流與壓力後維持率。' : activeView === 'liabilities' ? '記錄房貸、車貸與其他固定還款，讓淨資產與月支出更接近家庭現況。' : '記錄借款餘額、利息與擔保品，先看懂維持率，再決定是否擴大投資。'}</p>
        </div>
        <div className="heading-actions">
          <span className="local-data-pill"><ShieldCheck size={15} />資料僅存在本機</span>
          <div className="segmented-control page-view-switch" role="tablist" aria-label="質押功能">
            <button type="button" role="tab" aria-selected={activeView === 'simulation'} className={activeView === 'simulation' ? 'is-active' : ''} onClick={() => { setActiveView('simulation'); setModalOpen(false) }}>再投入模擬</button>
            <button type="button" role="tab" aria-selected={activeView === 'stress'} className={activeView === 'stress' ? 'is-active' : ''} onClick={() => { setActiveView('stress'); setModalOpen(false) }}>壓力測試</button>
            <button type="button" role="tab" aria-selected={activeView === 'scenarios'} className={activeView === 'scenarios' ? 'is-active' : ''} onClick={() => { setActiveView('scenarios'); setModalOpen(false) }}>方案比較</button>
            <button type="button" role="tab" aria-selected={activeView === 'loans'} className={activeView === 'loans' ? 'is-active' : ''} onClick={() => setActiveView('loans')}>借款管理</button>
            <button type="button" role="tab" aria-selected={activeView === 'liabilities'} className={activeView === 'liabilities' ? 'is-active' : ''} onClick={() => { setActiveView('liabilities'); setModalOpen(false) }}>一般負債</button>
          </div>
          {activeView === 'loans' && <button type="button" className="button button-primary" onClick={openNewLoan}><Plus size={17} />新增質押借款</button>}
        </div>
      </section>

      {activeView === 'simulation' ? <ReinvestmentSimulator stocks={stocks} settings={settings} summary={summary} displayMode={displayMode} /> : activeView === 'stress' ? <StressTestPanel stocks={stocks} loans={loans} collaterals={collaterals} settings={settings} summary={summary} displayMode={displayMode} /> : activeView === 'scenarios' ? <ScenarioComparison stocks={stocks} simulations={simulations} settings={settings} summary={summary} displayMode={displayMode} onSaveSimulation={onSaveSimulation} onDeleteSimulation={onDeleteSimulation} /> : activeView === 'liabilities' ? <GeneralLiabilitiesPanel liabilities={liabilities} realEstate={realEstate} displayMode={displayMode} onSave={onSaveLiability} onDelete={onDeleteLiability} /> : <>
      <section className={`risk-overview-card card ${statusClass(overview.status)}`}>
        <div className="risk-overview-top">
          <div>
            <div className="section-kicker">質押風控總覽</div>
            <h2>維持率，是槓桿的安全儀表板。</h2>
            <p className="risk-overview-description">{overview.status === 'unavailable' && loans.length === 0 ? '目前還沒有質押借款；建立第一筆資料後，這裡會同步計算擔保品與負債的關係。' : statusDescription(overview.status)}</p>
          </div>
          <div className="risk-overview-ratio">
            <div className="risk-overview-ratio-label"><OverviewIcon size={16} />目前維持率</div>
            <strong className="risk-overview-value">{maintenanceRatioLabel(overview.ratioPercent, overview.status)}</strong>
            <span className={`risk-badge ${statusClass(overview.status)}`}>{statusLabel(overview.status)}</span>
          </div>
        </div>
        <div className="risk-overview-progress" aria-label="目前維持率相對於警戒線">
          <span className={`risk-meter-fill ${statusClass(overview.status)}`} style={{ width: `${overview.status === 'unavailable' ? 0 : riskMeterWidth(overview.ratioPercent, settings.maintenanceWarningRatioPercent)}%` }} />
        </div>
        <div className="risk-overview-badges">
          <span className="risk-badge risk-badge-warning">警戒線 {formatPercent(settings.maintenanceWarningRatioPercent, 0)}</span>
          <span className="risk-badge risk-badge-danger">追繳線 {formatPercent(settings.maintenanceMarginCallRatioPercent, 0)}</span>
          <span className="risk-overview-rule">維持率 = 擔保品市值 ÷ 借款餘額 × 100%</span>
        </div>
        <div className="risk-overview-stats">
          <div className="risk-overview-stat"><span>擔保品市值</span><strong>{formatTwd(totalCollateralValue, displayMode)}</strong></div>
          <div className="risk-overview-stat"><span>借款餘額</span><strong>{formatTwd(totalLoanBalance, displayMode)}</strong></div>
          <div className="risk-overview-stat"><span>距警戒線</span><strong>{loans.length > 0 ? formatPercent(overview.distanceToWarningPoints) : '—'}</strong></div>
          <div className="risk-overview-stat"><span>借款筆數</span><strong>{loans.length} 筆</strong></div>
        </div>
      </section>

      <section className="section-heading-row loan-list-heading">
        <div><div className="section-kicker">借款清單</div><h2>每一筆負債，都有自己的擔保品。</h2></div>
        <span className="section-caption">利息依目前餘額估算</span>
      </section>

      {loans.length === 0 ? (
        <section className="card empty-card">
          <EmptyState icon={Landmark} title="還沒有質押借款" description="輸入借款本金、利率與擔保股票，系統會即時預覽每月利息與維持率。" actionLabel="新增質押借款" onAction={openNewLoan} />
        </section>
      ) : (
        <div className="loan-list">
          {loans.map((loan) => {
            const loanCollaterals = loan.collateralIds.map((id) => collaterals.find((collateral) => collateral.id === id)).filter((collateral): collateral is Collateral => Boolean(collateral))
            const loanCollateralValue = calculateTotalCollateralValueTwd(loanCollaterals, stocks)
            const loanOverview = calculateMaintenanceOverview(loanCollateralValue, loan.outstandingBalance, loan.warningRatioPercent, loan.marginCallRatioPercent)
            const LoanStatusIcon = statusIcon(loanOverview.status)
            const monthlyInterest = loan.monthlyInterest > 0 ? loan.monthlyInterest : calculateMonthlyLoanInterest(loan.outstandingBalance, loan.annualInterestRatePercent)
            return (
              <article className={`card loan-card ${statusClass(loanOverview.status)}`} key={loan.id}>
                <div className="loan-card-header">
                  <div className="loan-card-title"><span className="loan-card-icon"><Banknote size={17} /></span><div><h3>{loan.name || '未命名質押借款'}</h3><small>{loan.institution || '未填寫金融機構'} · 借款日 {loan.borrowedAt || '—'}</small></div></div>
                  <div className="loan-card-balance"><small>目前餘額</small><strong>{formatTwd(loan.outstandingBalance, displayMode)}</strong></div>
                  <div className="loan-card-actions"><button type="button" className="button button-ghost" onClick={() => openEditLoan(loan)}><Edit3 size={14} />編輯</button><button type="button" className="icon-button small danger-hover" aria-label={`刪除 ${loan.name || '質押借款'}`} onClick={() => void handleDelete(loan)}><Trash2 size={15} /></button></div>
                </div>
                <div className="loan-card-stats">
                  <div><span>維持率</span><strong className={`status-text ${statusClass(loanOverview.status)}`}><LoanStatusIcon size={13} />{maintenanceRatioLabel(loanOverview.ratioPercent, loanOverview.status)}</strong></div>
                  <div><span>每月利息</span><strong>{formatTwd(monthlyInterest, displayMode)}</strong></div>
                  <div><span>年利率</span><strong>{formatPercent(loan.annualInterestRatePercent)}</strong></div>
                  <div><span>距警戒線</span><strong>{formatPercent(loanOverview.distanceToWarningPoints)}</strong></div>
                </div>
                <div className="risk-meter" aria-label={`${loan.name || '質押借款'}維持率進度`}><span className={`risk-meter-fill ${statusClass(loanOverview.status)}`} style={{ width: `${loanOverview.status === 'unavailable' ? 0 : riskMeterWidth(loanOverview.ratioPercent, loan.warningRatioPercent)}%` }} /></div>
                <div className="loan-card-collateral">
                  <div className="section-kicker">擔保品 / {formatTwd(loanCollateralValue, displayMode)}</div>
                  {loanCollaterals.length > 0 ? loanCollaterals.map((collateral) => {
                    const stock = stocks.find((item) => item.id === collateral.stockAssetId)
                    return <div className="loan-collateral-row" key={collateral.id}><div><strong>{stock?.symbol ?? '未知股票'}</strong><span>{stock?.name ?? '此股票可能已被刪除'}</span></div><div><strong>{formatNumber(collateral.pledgedShares)} 股</strong><span>{formatTwd(calculateCollateralValueTwd(collateral, stocks), displayMode)}</span></div></div>
                  }) : <div className="inline-empty">尚未綁定股票擔保品，維持率暫時無法判讀。</div>}
                </div>
              </article>
            )
          })}
        </div>
      )}

      <div className="formula-note"><span className="formula-note-mark">↗</span><span><strong>本頁的判讀邏輯：</strong>維持率只反映你輸入的擔保品市值與借款餘額，不代表任何金融機構的正式授信或追繳通知。</span></div>

      {modalOpen && <Modal title={editingLoan ? '編輯質押借款' : '新增質押借款'} description="借款與擔保品資料只會儲存在這台裝置。" onClose={() => setModalOpen(false)}>
        <form className="asset-form" onSubmit={(event) => void handleSubmit(event)}>
          <div className="form-grid form-grid-two">
            <FormField label="借款名稱"><input required value={draft.name} onChange={(event) => setDraft((current) => ({ ...current, name: event.target.value }))} placeholder="例如 0050 質押借款" /></FormField>
            <FormField label="金融機構"><input value={draft.institution} onChange={(event) => setDraft((current) => ({ ...current, institution: event.target.value }))} placeholder="例如 XX 證券" /></FormField>
            <FormField label="原始借款本金"><input required min="0" step="any" type="number" value={draft.principal || ''} onChange={(event) => setDraft((current) => ({ ...current, principal: Number(event.target.value) }))} placeholder="0" /></FormField>
            <FormField label="目前借款餘額"><input required min="0" step="any" type="number" value={draft.outstandingBalance || ''} onChange={(event) => setDraft((current) => ({ ...current, outstandingBalance: Number(event.target.value) }))} placeholder="0" /></FormField>
            <FormField label="年利率" hint="%"><input required min="0" step="0.01" type="number" value={draft.annualInterestRatePercent || ''} onChange={(event) => setDraft((current) => ({ ...current, annualInterestRatePercent: Number(event.target.value) }))} placeholder="例如 2.8" /></FormField>
            <FormField label="還款方式"><div className="select-wrap"><select value={draft.repaymentMethod} onChange={(event) => setDraft((current) => ({ ...current, repaymentMethod: event.target.value as RepaymentMethod }))}><option value="interest-only">只繳利息</option><option value="equal-principal">本金平均攤還</option><option value="amortized">本息平均攤還</option></select><SelectChevron /></div></FormField>
            <FormField label="借款日"><input required type="date" value={draft.borrowedAt} onChange={(event) => setDraft((current) => ({ ...current, borrowedAt: event.target.value }))} /></FormField>
            <FormField label="到期日" hint="可留空"><input type="date" value={draft.maturityDate} onChange={(event) => setDraft((current) => ({ ...current, maturityDate: event.target.value }))} /></FormField>
            <FormField label="每月預計還本" hint="選填"><input min="0" step="any" type="number" value={draft.monthlyPrincipal || ''} onChange={(event) => setDraft((current) => ({ ...current, monthlyPrincipal: Number(event.target.value) }))} placeholder="0" /></FormField>
            <FormField label="警戒線" hint="維持率 %"><input required min="1" step="1" type="number" value={draft.warningRatioPercent} onChange={(event) => setDraft((current) => ({ ...current, warningRatioPercent: Number(event.target.value) }))} /></FormField>
            <FormField label="追繳線" hint="維持率 %"><input required min="1" step="1" type="number" value={draft.marginCallRatioPercent} onChange={(event) => setDraft((current) => ({ ...current, marginCallRatioPercent: Number(event.target.value) }))} /></FormField>
          </div>

          <div className="loan-form-preview status-preview">
            <div className="loan-form-preview-header"><div><div className="section-kicker">即時試算</div><strong>這筆借款的風控預覽</strong></div><span className={`risk-badge ${statusClass(draftOverview.status)}`}><DraftOverviewIcon size={13} />{statusLabel(draftOverview.status)}</span></div>
            <div className="preview-grid">
              <div><span>擔保品市值</span><strong>{formatTwd(selectedCollateralValue, displayMode)}</strong></div>
              <div><span>維持率</span><strong className={`status-text ${statusClass(draftOverview.status)}`}>{maintenanceRatioLabel(draftOverview.ratioPercent, draftOverview.status)}</strong></div>
              <div><span>每月利息</span><strong>{formatTwd(calculateMonthlyLoanInterest(draft.outstandingBalance, draft.annualInterestRatePercent), displayMode)}</strong></div>
              <div><span>距追繳線</span><strong>{formatPercent(draftOverview.distanceToMarginCallPoints)}</strong></div>
            </div>
          </div>

          <div className="section-heading-row collateral-heading"><div><div className="section-kicker">擔保品選擇</div><h3>哪些股票要放進這筆借款？</h3></div><span className="section-caption">可複選</span></div>
          {stocks.length === 0 ? <div className="inline-empty">請先到資產管理新增股票，才能建立擔保品。</div> : <div className="collateral-options">{stocks.map((stock) => {
            const selection = draft.selectedCollaterals.find((item) => item.stockAssetId === stock.id)
            return <label className={`collateral-option ${selection ? 'selected' : ''}`} key={stock.id}>
              <input type="checkbox" checked={Boolean(selection)} onChange={() => toggleCollateral(stock)} />
              <div className="collateral-option-main"><div className="collateral-option-title"><span><strong>{stock.symbol}</strong><small>{stock.name}</small></span>{selection && <Check size={16} />}</div><div className="collateral-option-meta"><span>可用市值 {formatTwd(calculateCollateralValueTwd({ id: 'preview', name: '', institution: '', stockAssetId: stock.id, pledgedShares: stock.shares, maintenanceFormula: 'market-value-over-loan', warningRatioPercent: draft.warningRatioPercent, marginCallRatioPercent: draft.marginCallRatioPercent, notes: '', createdAt: '', updatedAt: '' }, stocks), displayMode)}</span>{stock.asCollateral && <em>已標記擔保品</em>}</div>{selection && <div className="pledged-input" onClick={(event) => event.stopPropagation()}><span>質押股數</span><input min="0" max={stock.shares} step="any" type="number" value={selection.pledgedShares || ''} onChange={(event) => setDraft((current) => ({ ...current, selectedCollaterals: current.selectedCollaterals.map((item) => item.stockAssetId === stock.id ? { ...item, pledgedShares: Number(event.target.value) } : item) }))} /></div>}</div>
            </label>
          })}</div>}

          <FormField label="備註" wide><textarea value={draft.notes} onChange={(event) => setDraft((current) => ({ ...current, notes: event.target.value }))} placeholder="例如：額度用途、預計還款來源或更新日期" rows={3} /></FormField>
          <div className="modal-actions"><button type="button" className="button button-ghost" onClick={() => setModalOpen(false)}>取消</button><button type="submit" className="button button-primary"><Check size={16} />儲存借款</button></div>
        </form>
      </Modal>}
      </>}
    </div>
  )
}
