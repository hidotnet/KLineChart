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

import type Coordinate from '../common/Coordinate'
import type { CandleHighLowPriceMarkStyle } from '../common/Styles'

import View from './View'

import type { YAxis } from '../component/YAxis'

import { formatPrecision, formatThousands, formatFoldDecimal } from '../common/utils/format'

export default class CandleHighLowPriceView extends View<YAxis> {
  override drawImp (ctx: CanvasRenderingContext2D): void {
    const widget = this.getWidget()
    const pane = widget.getPane()
    const chartStore = pane.getChart().getChartStore()
    const priceMarkStyles = chartStore.styles.candle.priceMark
    const highPriceMarkStyles = priceMarkStyles.high
    const lowPriceMarkStyles = priceMarkStyles.low
    if (priceMarkStyles.show && (highPriceMarkStyles.show || lowPriceMarkStyles.show)) {
      const highestLowestPrice = chartStore.visibleRangeHighLowPrice
      const thousandsSeparator = chartStore.thousandsSeparator
      const decimalFoldThreshold = chartStore.decimalFoldThreshold
      const precision = chartStore.precision
      const yAxis = pane.getAxisComponent()

      const { price: high, x: highX } = highestLowestPrice[0]
      const { price: low, x: lowX } = highestLowestPrice[1]
      const highY = yAxis.convertToPixel(high)
      const lowY = yAxis.convertToPixel(low)
      if (highPriceMarkStyles.show && high !== Number.MIN_SAFE_INTEGER) {
        this._drawMark(
          ctx,
          formatFoldDecimal(formatThousands(formatPrecision(high, precision.price), thousandsSeparator), decimalFoldThreshold),
          { x: highX, y: highY },
          highY < lowY ? [-2, -5] : [2, 5],
          highPriceMarkStyles
        )
      }
      if (lowPriceMarkStyles.show && low !== Number.MAX_SAFE_INTEGER) {
        this._drawMark(
          ctx,
          formatFoldDecimal(formatThousands(formatPrecision(low, precision.price), thousandsSeparator), decimalFoldThreshold),
          { x: lowX, y: lowY },
          highY < lowY ? [2, 5] : [-2, -5],
          lowPriceMarkStyles
        )
      }
    }
  }

  private _drawMark (
    ctx: CanvasRenderingContext2D,
    text: string,
    coordinate: Coordinate,
    offsets: number[],
    styles: CandleHighLowPriceMarkStyle
  ): void {
    const startX = coordinate.x
    const startY = coordinate.y + offsets[0]
    this.createFigure({
      name: 'line',
      attrs: {
        coordinates: [
          { x: startX - 2, y: startY + offsets[0] },
          { x: startX, y: startY },
          { x: startX + 2, y: startY + offsets[0] }
        ]
      },
      styles: { color: styles.color }
    })?.draw(ctx)

    let lineEndX = 0
    let textStartX = 0
    let textAlign = 'left'
    const { width } = this.getWidget().getBounding()
    if (startX > width / 2) {
      lineEndX = startX - 5
      textStartX = lineEndX - styles.textOffset
      textAlign = 'right'
    } else {
      lineEndX = startX + 5
      textAlign = 'left'
      textStartX = lineEndX + styles.textOffset
    }

    const y = startY + offsets[1]
    this.createFigure({
      name: 'line',
      attrs: {
        coordinates: [
          { x: startX, y: startY },
          { x: startX, y },
          { x: lineEndX, y }
        ]
      },
      styles: { color: styles.color }
    })?.draw(ctx)
    this.createFigure({
      name: 'text',
      attrs: {
        x: textStartX,
        y,
        text,
        align: textAlign,
        baseline: 'middle'
      },
      styles: {
        color: styles.color,
        size: styles.textSize,
        family: styles.textFamily,
        weight: styles.textWeight
      }
    })?.draw(ctx)
  }
}
