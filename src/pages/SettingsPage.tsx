import { useRef, useState, type ChangeEvent } from 'react'
import { Check, Database, Download, Moon, Palette, RotateCcw, ShieldCheck, Sun, Upload } from 'lucide-react'
import { parseBackupData, type BackupImportMode } from '../data/backup'
import type { AppSettings, BackupData, ThemeMode } from '../domain/models'

interface SettingsPageProps {
  settings: AppSettings
  hasDemoData: boolean
  onUpdateSettings: (settings: AppSettings) => Promise<void>
  onClearDemoData: () => Promise<void>
  onExportBackup: () => void
  onImportBackup: (backup: BackupData, mode: BackupImportMode) => Promise<void>
}

export function SettingsPage({ settings, hasDemoData, onUpdateSettings, onClearDemoData, onExportBackup, onImportBackup }: SettingsPageProps) {
  const [isClearing, setIsClearing] = useState(false)
  const [isImporting, setIsImporting] = useState(false)
  const [pendingBackup, setPendingBackup] = useState<BackupData | null>(null)
  const [backupError, setBackupError] = useState<string | null>(null)
  const backupInputRef = useRef<HTMLInputElement>(null)

  const update = (changes: Partial<AppSettings>) => {
    void onUpdateSettings({ ...settings, ...changes, updatedAt: new Date().toISOString() })
  }

  const handleClearDemo = async () => {
    if (!window.confirm('確定要清除所有示範股票與現金資料嗎？這個動作無法復原。')) return
    setIsClearing(true)
    try {
      await onClearDemoData()
    } finally {
      setIsClearing(false)
    }
  }

  const handleBackupFile = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    event.target.value = ''
    if (!file) return

    try {
      const backup = parseBackupData(await file.text())
      setPendingBackup(backup)
      setBackupError(null)
    } catch (error) {
      setPendingBackup(null)
      setBackupError(error instanceof Error ? error.message : '備份檔無法讀取。')
    }
  }

  const handleImport = async (mode: BackupImportMode) => {
    if (!pendingBackup) return
    if (mode === 'replace' && !window.confirm('覆蓋會清除目前本機的股票、現金、借款、現金流與設定，再換成備份內容。確定繼續嗎？')) return

    setIsImporting(true)
    try {
      await onImportBackup(pendingBackup, mode)
      setPendingBackup(null)
      setBackupError(null)
    } finally {
      setIsImporting(false)
    }
  }

  const backupRecordCount = pendingBackup
    ? pendingBackup.stocks.length + pendingBackup.cash.length + pendingBackup.loans.length + pendingBackup.collaterals.length + pendingBackup.cashFlowItems.length + pendingBackup.simulations.length + pendingBackup.dividendTargets.length
    : 0

  return (
    <div className="page-container narrow-page-container">
      <section className="page-heading">
        <div>
          <div className="eyebrow"><span className="eyebrow-mark" />系統設定</div>
          <h1>讓工具，<span>跟你的習慣一起工作。</span></h1>
          <p>V1.2 已加入房產、一般負債與家庭固定支出；這裡集中管理顯示、風控與資料搬移。</p>
        </div>
      </section>

      <section className="settings-section">
        <div className="settings-section-heading"><div className="settings-section-icon"><Palette size={18} /></div><div><h2>外觀與數值</h2><p>設定會跟著本機資料一起保存。</p></div></div>
        <div className="settings-card card">
          <div className="setting-row"><div><strong>顯示模式</strong><span>支援淺色、深色與跟隨系統。</span></div><div className="theme-options" role="radiogroup" aria-label="顯示模式">
            <ThemeOption value="system" label="系統" icon={Palette} selected={settings.themeMode} onSelect={(value) => update({ themeMode: value })} />
            <ThemeOption value="light" label="淺色" icon={Sun} selected={settings.themeMode} onSelect={(value) => update({ themeMode: value })} />
            <ThemeOption value="dark" label="深色" icon={Moon} selected={settings.themeMode} onSelect={(value) => update({ themeMode: value })} />
          </div></div>
          <div className="setting-row"><div><strong>金額顯示</strong><span>簡化模式適合快速瀏覽大型資產。</span></div><div className="segmented-control compact-segmented"><button type="button" className={settings.numberDisplayMode === 'exact' ? 'is-active' : ''} onClick={() => update({ numberDisplayMode: 'exact' })}>完整數字</button><button type="button" className={settings.numberDisplayMode === 'compact' ? 'is-active' : ''} onClick={() => update({ numberDisplayMode: 'compact' })}>簡化顯示</button></div></div>
        </div>
      </section>

      <section className="settings-section">
        <div className="settings-section-heading"><div className="settings-section-icon warning-icon"><ShieldCheck size={18} /></div><div><h2>質押風控門檻</h2><p>質押管理與首頁風控卡會套用這些維持率門檻。</p></div></div>
        <div className="settings-card card">
          <div className="form-grid form-grid-two settings-form-grid">
            <label className="form-field"><span>警戒維持率<small>低於此值顯示警戒</small></span><div className="input-with-suffix"><input type="number" min="0" step="1" value={settings.maintenanceWarningRatioPercent} onChange={(event) => update({ maintenanceWarningRatioPercent: Number(event.target.value) })} /><em>%</em></div></label>
            <label className="form-field"><span>追繳維持率<small>低於此值顯示危險</small></span><div className="input-with-suffix"><input type="number" min="0" step="1" value={settings.maintenanceMarginCallRatioPercent} onChange={(event) => update({ maintenanceMarginCallRatioPercent: Number(event.target.value) })} /><em>%</em></div></label>
          </div>
          <div className="threshold-preview"><span className="threshold-danger">危險 &lt; {settings.maintenanceMarginCallRatioPercent}%</span><span className="threshold-warning">警戒 {settings.maintenanceMarginCallRatioPercent}%–{settings.maintenanceWarningRatioPercent}%</span><span className="threshold-safe">安全 ≥ {settings.maintenanceWarningRatioPercent}%</span></div>
        </div>
      </section>

      <section className="settings-section">
        <div className="settings-section-heading"><div className="settings-section-icon"><Database size={18} /></div><div><h2>本機資料</h2><p>這個版本不連接後端、不登入、不蒐集分析資料。</p></div></div>
        <div className="settings-card card">
           <div className="privacy-callout"><div className="privacy-callout-icon"><ShieldCheck size={19} /></div><div><strong>資產資料留在這台裝置</strong><p>股票、現金與設定保存於瀏覽器 IndexedDB；只有查詢行情時會送出股票代號，不會同步資產內容或備份資料。</p></div></div>
          <div className="data-action-row"><div><strong>示範資料</strong><span>{hasDemoData ? '目前仍有可刪除的 Demo 股票或現金。' : '示範資料已清除，之後新增的資料不會被移除。'}</span></div><button type="button" className="button button-danger-outline" disabled={!hasDemoData || isClearing} onClick={() => void handleClearDemo}><RotateCcw size={15} />{isClearing ? '清除中…' : '清除示範資料'}</button></div>
          <div className="data-action-row backup-action-row"><div><strong>備份與匯入</strong><span>JSON 只在你的裝置產生與讀取，不會上傳資產資料。</span></div><div className="future-actions"><button type="button" className="button button-ghost" onClick={onExportBackup}><Download size={15} />匯出 JSON</button><button type="button" className="button button-ghost" onClick={() => backupInputRef.current?.click()}><Upload size={15} />匯入 JSON</button></div><input ref={backupInputRef} className="visually-hidden" type="file" accept="application/json,.json" onChange={(event) => void handleBackupFile(event)} /></div>
          {backupError && <div className="backup-error" role="alert"><strong>備份檔無法匯入</strong><span>{backupError}</span></div>}
          {pendingBackup && <div className="backup-import-panel"><div><div className="section-kicker">已讀取備份</div><strong>{new Date(pendingBackup.exportedAt).toLocaleString('zh-TW')} · {backupRecordCount} 筆資料</strong><p>合併會以備份中的相同 ID 覆蓋本機同筆資料；覆蓋則會先清除本機資料。</p></div><div className="backup-import-actions"><button type="button" className="button button-primary" disabled={isImporting} onClick={() => void handleImport('merge')}>{isImporting ? '處理中…' : '合併到本機'}</button><button type="button" className="button button-danger-outline" disabled={isImporting} onClick={() => void handleImport('replace')}>覆蓋本機資料</button><button type="button" className="button button-ghost" disabled={isImporting} onClick={() => setPendingBackup(null)}>取消</button></div></div>}
        </div>
      </section>

       <footer className="settings-footer"><span className="footer-check"><Check size={14} />本機優先</span><span>Asset Leverage Cashflow · V1.5.0</span></footer>
    </div>
  )
}

function ThemeOption({ value, label, icon: Icon, selected, onSelect }: { value: ThemeMode; label: string; icon: typeof Palette; selected: ThemeMode; onSelect: (value: ThemeMode) => void }) {
  const isSelected = value === selected
  return <button type="button" role="radio" aria-checked={isSelected} className={`theme-option ${isSelected ? 'is-selected' : ''}`} onClick={() => onSelect(value)}><Icon size={15} /><span>{label}</span>{isSelected && <Check size={13} />}</button>
}
