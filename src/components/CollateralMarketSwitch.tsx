import type { Market, StockAsset } from '../domain/models'

export type CollateralMarket = Extract<Market, 'TW' | 'US'>

interface CollateralMarketSwitchProps {
  value: CollateralMarket
  stocks: StockAsset[]
  onChange: (market: CollateralMarket) => void
}

const marketOptions: Array<{ value: CollateralMarket; label: string }> = [
  { value: 'TW', label: '台股' },
  { value: 'US', label: '美股' },
]

export function CollateralMarketSwitch({ value, stocks, onChange }: CollateralMarketSwitchProps) {
  return (
    <div className="segmented-control collateral-market-switch" role="tablist" aria-label="擔保品市場">
      {marketOptions.map((option) => (
        <button key={option.value} type="button" role="tab" aria-selected={value === option.value} className={value === option.value ? 'is-active' : ''} onClick={() => onChange(option.value)}>
          <span className="collateral-market-label">{option.label}</span>
          <span>{stocks.filter((stock) => stock.market === option.value).length}</span>
        </button>
      ))}
    </div>
  )
}
