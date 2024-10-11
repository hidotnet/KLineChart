/**
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at

 * http://www.apache.org/licenses/LICENSE-2.0

 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

import type Nullable from '../common/Nullable'
import type { KLineData, VisibleRangeData } from '../common/Data'
import type Precision from '../common/Precision'
import type DeepPartial from '../common/DeepPartial'
import { formatValue } from '../common/utils/format'
import { getDefaultStyles, type Styles, type TooltipLegend } from '../common/Styles'
import { isArray, isNumber, isString, isValid, merge } from '../common/utils/typeChecks'
import { type LoadDataCallback, type LoadDataParams, LoadDataType } from '../common/LoadDataCallback'

import { getDefaultCustomApi, type CustomApi, defaultLocale, type Options } from '../Options'

import TimeScaleStore from './TimeScaleStore'
import IndicatorStore from './IndicatorStore'
import TooltipStore from './TooltipStore'
import OverlayStore from './OverlayStore'
import ActionStore from './ActionStore'

import { getStyles } from '../extension/styles/index'

import type Chart from '../Chart'
export default class ChartStore {
  /**
   * Internal chart
   */
  private readonly _chart: Chart

  /**
   * Style config
   */
  private readonly _styles = getDefaultStyles()

  /**
   * Custom api
   */
  private readonly _customApi = getDefaultCustomApi()

  /**
   * language
   */
  private _locale = defaultLocale

  /**
   * Price and volume precision
   */
  private _precision = { price: 2, volume: 0 }

  /**
   * Thousands separator
   */
  private _thousandsSeparator = ','

  /**
   * Decimal fold threshold
   */
  private _decimalFoldThreshold = 3

  /**
   * Data source
   */
  private _dataList: KLineData[] = []

  /**
   * Load more data callback
   */
  private _loadMoreDataCallback: Nullable<LoadDataCallback> = null

  /**
   * Is loading data flag
   */
  private _loading = true

  /**
  * Whether there are forward and backward more flag
   */
  private readonly _loadDataMore = { forward: false, backward: false }

  /**
   * Time scale store
   */
  private readonly _timeScaleStore = new TimeScaleStore(this)

  /**
   * Indicator store
   */
  private readonly _indicatorStore = new IndicatorStore(this)

  /**
   * Overlay store
   */
  private readonly _overlayStore = new OverlayStore(this)

  /**
   * Tooltip store
   */
  private readonly _tooltipStore = new TooltipStore(this)

  /**
   * Chart action store
   */
  private readonly _actionStore = new ActionStore()

  /**
   * Visible data array
   */
  private _visibleRangeDataList: VisibleRangeData[] = []

  /**
   * Visible highest lowest price data
   */
  private _visibleRangeHighLowPrice = [
    { x: 0, price: Number.MIN_SAFE_INTEGER },
    { x: 0, price: Number.MAX_SAFE_INTEGER },
  ]

  constructor (chart: Chart, options?: Options) {
    this._chart = chart
    if (isValid(options)) {
      this.options = options
    }
  }

  /**
   * @description Adjust visible data
   * @return {*}
   */
  adjustVisibleRangeDataList (): void {
    this._visibleRangeDataList = []
    this._visibleRangeHighLowPrice = [
      { x: 0, price: Number.MIN_SAFE_INTEGER },
      { x: 0, price: Number.MAX_SAFE_INTEGER },
    ]
    const { realFrom, realTo } = this._timeScaleStore.visibleRange
    for (let i = realFrom; i < realTo; i++) {
      const kLineData = this._dataList[i]
      const x = this._timeScaleStore.dataIndexToCoordinate(i)
      this._visibleRangeDataList.push({
        dataIndex: i,
        x,
        data: kLineData
      })
      if (isValid(kLineData)) {
        if (this._visibleRangeHighLowPrice[0].price < kLineData.high) {
          this._visibleRangeHighLowPrice[0].price = kLineData.high
          this._visibleRangeHighLowPrice[0].x = x
        }
        if (this._visibleRangeHighLowPrice[1].price > kLineData.low) {
          this._visibleRangeHighLowPrice[1].price = kLineData.low
          this._visibleRangeHighLowPrice[1].x = x
        }
      }
    }
  }

  set options (options: Options) {
    if (isValid(options)) {
      const { locale, timezone, styles, customApi, thousandsSeparator, decimalFoldThreshold } = options
      if (isString(locale)) {
        this._locale = locale
      }
      if (isString(timezone)) {
        this._timeScaleStore.timezone = timezone
      }
      if (isValid(styles)) {
        let ss: Nullable<DeepPartial<Styles>> = null
        if (isString(styles)) {
          ss = getStyles(styles)
        } else {
          ss = styles
        }
        merge(this._styles, ss)
        // `candle.tooltip.custom` should override
        if (isArray(ss?.candle?.tooltip?.custom)) {
          this._styles.candle.tooltip.custom = ss.candle.tooltip.custom as unknown as TooltipLegend[]
        }
      }
      if (isValid(customApi)) {
        merge(this._customApi, customApi)
      }
      if (isString(thousandsSeparator)) {
        this._thousandsSeparator = thousandsSeparator
      }
      if (isNumber(decimalFoldThreshold) && decimalFoldThreshold > 0) {
        this._decimalFoldThreshold = decimalFoldThreshold
      }
    }
  }

  get styles (): Styles {
    return this._styles
  }

  get locale (): string {
    return this._locale
  }

  get customApi (): CustomApi {
    return this._customApi
  }

  get thousandsSeparator (): string {
    return this._thousandsSeparator
  }

  get decimalFoldThreshold (): number {
    return this._decimalFoldThreshold
  }

  get precision (): Precision {
    return this._precision
  }

  set precision (precision: Precision) {
    this._precision = precision
    this._indicatorStore.synchronizeSeriesPrecision()
  }

  get dataList (): KLineData[] {
    return this._dataList
  }

  get visibleRangeDataList (): VisibleRangeData[] {
    return this._visibleRangeDataList
  }

  get visibleRangeHighLowPrice (): Array<{ price: number; x: number }> {
    return this._visibleRangeHighLowPrice
  }

  addData (
    data: KLineData | KLineData[],
    type: LoadDataType,
    more?: { forward: boolean, backward: boolean }
  ): void {
    let success = false
    let adjustFlag = false
    let dataLengthChange = 0
    if (isArray<KLineData>(data)) {
      dataLengthChange = data.length
      switch (type) {
        case LoadDataType.Init: {
          this.clear()
          this._dataList = data
          this._loadDataMore.backward = more?.forward ?? false
          this._loadDataMore.forward = more?.forward ?? false
          this._timeScaleStore.classifyTimeTicks(this._dataList)
          this._timeScaleStore.resetOffsetRightDistance()
          adjustFlag = true
          break
        }
        case LoadDataType.Backward: {
          this._timeScaleStore.classifyTimeTicks(data, true)
          this._dataList = this._dataList.concat(data)
          this._loadDataMore.backward = more?.backward ?? false
          adjustFlag = dataLengthChange > 0
          break
        }
        case LoadDataType.Forward: {
          this._dataList = data.concat(this._dataList)
          this._timeScaleStore.classifyTimeTicks(this._dataList)
          this._loadDataMore.forward = more?.forward ?? false
          adjustFlag = dataLengthChange > 0
        }
      }
      this._loading = false
      success = true
    } else {
      const dataCount = this._dataList.length
      // Determine where individual data should be added
      const timestamp = data.timestamp
      const lastDataTimestamp = formatValue(this._dataList[dataCount - 1], 'timestamp', 0) as number
      if (timestamp > lastDataTimestamp) {
        this._timeScaleStore.classifyTimeTicks([data], true)
        this._dataList.push(data)
        let lastBarRightSideDiffBarCount = this._timeScaleStore.lastBarRightSideDiffBarCount
        if (lastBarRightSideDiffBarCount < 0) {
          this._timeScaleStore.lastBarRightSideDiffBarCount = --lastBarRightSideDiffBarCount
        }
        dataLengthChange = 1
        success = true
        adjustFlag = true
      } else if (timestamp === lastDataTimestamp) {
        this._dataList[dataCount - 1] = data
        success = true
        adjustFlag = true
      }
    }
    if (success) {
      this._overlayStore.updatePointPosition(dataLengthChange, type)
      if (adjustFlag) {
        this._timeScaleStore.adjustVisibleRange()
        this._tooltipStore.recalculateCrosshair(true)
        this._indicatorStore.calcInstance(type, {})
        this._chart.adjustPaneViewport(false, true, true, true)
      }
    }
  }

  set loadMoreDataCallback (callback: LoadDataCallback) {
    this._loadMoreDataCallback = callback
  }

  executeLoadMoreDataCallback (params: Omit<LoadDataParams, 'callback'>): void {
    if (
      !this._loading &&
      isValid(this._loadMoreDataCallback) &&
      (
        (this._loadDataMore.forward && params.type === LoadDataType.Forward) ||
        (this._loadDataMore.backward && params.type === LoadDataType.Backward)
      )
    ) {
      const cb: ((data: KLineData[], more?: boolean) => void) = (data: KLineData[], more?: boolean) => {
        this.addData(data, params.type, { forward: more ?? false, backward: more ?? false })
      }
      this._loading = true
      this._loadMoreDataCallback({ ...params, callback: cb })
    }
  }

  clear (): void {
    this._loadDataMore.backward = false
    this._loadDataMore.forward = false
    this._loading = true
    this._dataList = []
    this._visibleRangeDataList = []
    this._visibleRangeHighLowPrice = [
      { x: 0, price: Number.MIN_SAFE_INTEGER },
      { x: 0, price: Number.MAX_SAFE_INTEGER },
    ]
    this._timeScaleStore.clear()
    this._tooltipStore.clear()
  }

  get timeScaleStore (): TimeScaleStore {
    return this._timeScaleStore
  }

  get indicatorStore (): IndicatorStore {
    return this._indicatorStore
  }

  get overlayStore (): OverlayStore {
    return this._overlayStore
  }

  get tooltipStore (): TooltipStore {
    return this._tooltipStore
  }

  get actionStore (): ActionStore {
    return this._actionStore
  }

  get chart (): Chart {
    return this._chart
  }
}
