import { AlertCircle, Check, CheckCircle2, FileImage, LoaderCircle, Upload, X } from 'lucide-react'
import type { HoldingImportCandidate, HoldingImportConfidence, OcrProgress } from '../services/holdingsImportService'

export type HoldingImportStatus = 'recognizing' | 'review' | 'error'

interface HoldingsScreenshotImportModalProps {
  status: HoldingImportStatus
  progress: OcrProgress | null
  message: string
  candidates: HoldingImportCandidate[]
  onClose: () => void
  onChooseFiles: () => void
  onUpdateCandidate: (id: string, patch: Partial<HoldingImportCandidate>) => void
  onConfirm: () => void
  isConfirming: boolean
}

function formatNumber(value: number | null): string {
  if (value === null || !Number.isFinite(value)) return '—'
  return new Intl.NumberFormat('zh-TW', { maximumFractionDigits: 6 }).format(value)
}

function confidenceLabel(confidence: HoldingImportConfidence): string {
  return confidence === 'high' ? '資料完整' : confidence === 'medium' ? '部分辨識' : '需要補填'
}

function isImportable(candidate: HoldingImportCandidate): boolean {
  return Boolean(candidate.symbol.trim() && candidate.shares !== null && candidate.shares > 0)
}

function numberValue(value: number | null): string | number {
  return value === null ? '' : value
}

export function HoldingsScreenshotImportModal({ status, progress, message, candidates, onClose, onChooseFiles, onUpdateCandidate, onConfirm, isConfirming }: HoldingsScreenshotImportModalProps) {
  const selectedCandidates = candidates.filter((candidate) => candidate.selected)
  const importableSelectedCount = selectedCandidates.filter(isImportable).length
  const hasIncompleteSelected = selectedCandidates.some((candidate) => !isImportable(candidate))
  const canConfirm = status === 'review' && selectedCandidates.length > 0 && !hasIncompleteSelected

  return (
    <div className="modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget && status !== 'recognizing' && !isConfirming) onClose() }}>
      <div className="modal-card holdings-import-modal-card" role="dialog" aria-modal="true" aria-labelledby="holdings-import-title">
        <div className="modal-header">
          <div>
            <div className="section-kicker">持倉匯入</div>
            <h2 id="holdings-import-title">上傳券商持倉截圖</h2>
            <p>截圖只在這台裝置內辨識；結果會先讓你逐筆確認，不會直接覆蓋現有持倉。</p>
          </div>
          <button type="button" className="icon-button" aria-label="關閉截圖匯入" onClick={onClose} disabled={status === 'recognizing' || isConfirming}><X size={19} /></button>
        </div>

        {status === 'recognizing' && (
          <section className="holdings-import-progress">
            <div className="holdings-import-progress-icon"><LoaderCircle size={23} className="spin-icon" /></div>
            <div className="holdings-import-progress-copy"><strong>正在辨識持倉內容…</strong><span>{progress?.fileName ?? '準備圖片'}{progress ? ` · ${progress.currentFile}/${progress.totalFiles}` : ''}</span></div>
            <div className="holdings-import-progress-bar"><span style={{ width: `${progress?.percent ?? 0}%` }} /></div>
            <small>{message || '第一次使用可能需要準備 OCR 語言資料，請稍候。'}</small>
          </section>
        )}

        {status === 'error' && (
          <section className="holdings-import-error" role="alert">
            <AlertCircle size={19} />
            <div><strong>截圖辨識沒有完成</strong><span>{message}</span></div>
          </section>
        )}

        {status === 'review' && (
          <>
            <div className="holdings-import-summary">
              <div><strong>{candidates.length}</strong><span>辨識到的標的</span></div>
              <div><strong>{importableSelectedCount}</strong><span>可加入資料</span></div>
              <button type="button" className="button button-ghost" onClick={onChooseFiles}><Upload size={15} />重新選擇</button>
            </div>
            <div className="holdings-import-review-note"><CheckCircle2 size={15} /><span>只要確認代號與持有股數即可加入；目前價格會在加入時自動抓取，平均成本若截圖沒有辨識到，可加入後再編輯補填。截圖損益只作為核對。</span></div>
            {message && <div className="holdings-import-action-note" role="status"><LoaderCircle size={14} className={isConfirming ? 'spin-icon' : undefined} /><span>{message}</span></div>}
            <div className="holdings-import-list">
              {candidates.map((candidate) => (
                <article className={`holdings-import-row ${candidate.selected ? 'is-selected' : ''}`} key={candidate.id}>
                  <label className="holdings-import-select">
                    <input type="checkbox" checked={candidate.selected} onChange={(event) => onUpdateCandidate(candidate.id, { selected: event.target.checked })} />
                    <span className="custom-checkbox"><Check size={13} /></span>
                  </label>
                  <div className="holdings-import-row-main">
                    <div className="holdings-import-row-heading"><div><strong>{candidate.symbol || '未辨識代號'}</strong><small>{candidate.sourceFileName} · {confidenceLabel(candidate.confidence)}</small></div><span className={`holdings-import-market holdings-import-market-${candidate.market}`}>{candidate.market === 'TW' ? '台股 · TWD' : '美股 · USD'}</span></div>
                    <div className="holdings-import-fields">
                      <label><span>股票代號</span><input value={candidate.symbol} onChange={(event) => onUpdateCandidate(candidate.id, { symbol: event.target.value.toUpperCase() })} /></label>
                      <label><span>股票名稱</span><input value={candidate.name} onChange={(event) => onUpdateCandidate(candidate.id, { name: event.target.value })} /></label>
                      <label><span>市場</span><select value={candidate.market} onChange={(event) => { const market = event.target.value as 'TW' | 'US'; onUpdateCandidate(candidate.id, { market, currency: market === 'TW' ? 'TWD' : 'USD' }) }}><option value="TW">台股</option><option value="US">美股</option></select></label>
                      <label><span>持有股數</span><input type="number" min="0" step="any" value={numberValue(candidate.shares)} onChange={(event) => onUpdateCandidate(candidate.id, { shares: event.target.value === '' ? null : Number(event.target.value) })} /></label>
                      <label><span>平均成本 / 股<small>可稍後補填</small></span><input type="number" min="0" step="any" value={numberValue(candidate.averageCost)} onChange={(event) => onUpdateCandidate(candidate.id, { averageCost: event.target.value === '' ? null : Number(event.target.value) })} /></label>
                      <label><span>目前價格 / 股<small>加入時自動抓取</small></span><input type="number" min="0" step="any" value={numberValue(candidate.currentPrice)} onChange={(event) => onUpdateCandidate(candidate.id, { currentPrice: event.target.value === '' ? null : Number(event.target.value) })} /></label>
                    </div>
                    <div className="holdings-import-row-meta"><span>截圖獲利 {candidate.reportedGain === null ? '—' : `${candidate.reportedGain >= 0 ? '+' : ''}${candidate.currency === 'USD' ? '$' : 'NT$'}${formatNumber(Math.abs(candidate.reportedGain))}`} {candidate.reportedGainPercent === null ? '' : `· ${candidate.reportedGainPercent}%`}</span>{candidate.warnings.length > 0 && <span className="holdings-import-warning"><AlertCircle size={13} />{candidate.warnings.join('；')}</span>}</div>
                  </div>
                </article>
              ))}
            </div>
          </>
        )}

        <div className="holdings-import-privacy"><FileImage size={15} /><span>辨識引擎在瀏覽器內執行。第一次使用會下載 OCR 引擎與繁中／英文語言資料；圖片本身不會上傳到 APP 後端。</span></div>
        <div className="modal-actions"><button type="button" className="button button-ghost" onClick={onClose} disabled={status === 'recognizing' || isConfirming}>取消</button>{status !== 'review' && <button type="button" className="button button-secondary" onClick={onChooseFiles} disabled={status === 'recognizing' || isConfirming}><Upload size={15} />重新上傳</button>}{status === 'review' && <button type="button" className="button button-primary" onClick={onConfirm} disabled={!canConfirm || isConfirming}>{isConfirming ? <LoaderCircle size={16} className="spin-icon" /> : <Check size={16} />}{isConfirming ? '查詢行情中…' : `加入 ${selectedCandidates.length} 筆持倉`}</button>}</div>
      </div>
    </div>
  )
}
