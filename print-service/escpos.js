const iconv = require('iconv-lite')

const CMD = {
  INIT: Buffer.from([0x1B, 0x40]),
  CODEPAGE_CP850: Buffer.from([0x1B, 0x74, 0x02]),
  ALIGN_LEFT: Buffer.from([0x1B, 0x61, 0x00]),
  ALIGN_CENTER: Buffer.from([0x1B, 0x61, 0x01]),
  ALIGN_RIGHT: Buffer.from([0x1B, 0x61, 0x02]),
  BOLD_ON: Buffer.from([0x1B, 0x45, 0x01]),
  BOLD_OFF: Buffer.from([0x1B, 0x45, 0x00]),
  FONT_A: Buffer.from([0x1B, 0x4D, 0x00]),
  FONT_B: Buffer.from([0x1B, 0x4D, 0x01]),
  SIZE_NORMAL: Buffer.from([0x1D, 0x21, 0x00]),
  SIZE_DOUBLE_HEIGHT: Buffer.from([0x1D, 0x21, 0x01]),
  SIZE_DOUBLE_WIDTH: Buffer.from([0x1D, 0x21, 0x10]),
  SIZE_DOUBLE: Buffer.from([0x1D, 0x21, 0x11]),
  LF: Buffer.from([0x0A]),
  CUT_PARTIAL: Buffer.from([0x1D, 0x56, 0x42, 0x03]),
}

const COLS = 42

class EscPosBuilder {
  constructor() {
    this.parts = []
    this.push(CMD.INIT)
    this.push(CMD.CODEPAGE_CP850)
    this.push(CMD.FONT_A)
    this.push(CMD.SIZE_NORMAL)
  }

  push(buf) {
    this.parts.push(buf)
    return this
  }

  text(str) {
    return this.push(iconv.encode(str, 'cp850'))
  }

  newline() {
    return this.push(CMD.LF)
  }

  feed(n) {
    return this.push(Buffer.from([0x1B, 0x64, n]))
  }

  alignLeft() { return this.push(CMD.ALIGN_LEFT) }
  alignCenter() { return this.push(CMD.ALIGN_CENTER) }
  alignRight() { return this.push(CMD.ALIGN_RIGHT) }

  boldOn() { return this.push(CMD.BOLD_ON) }
  boldOff() { return this.push(CMD.BOLD_OFF) }

  sizeNormal() { return this.push(CMD.SIZE_NORMAL) }
  sizeDouble() { return this.push(CMD.SIZE_DOUBLE) }
  sizeDoubleHeight() { return this.push(CMD.SIZE_DOUBLE_HEIGHT) }
  sizeDoubleWidth() { return this.push(CMD.SIZE_DOUBLE_WIDTH) }

  dashedLine() {
    return this.text('-'.repeat(COLS)).newline()
  }

  line(str) {
    return this.text(str).newline()
  }

  centerLine(str) {
    this.alignCenter()
    this.text(str).newline()
    return this.alignLeft()
  }

  leftRight(left, right) {
    const gap = COLS - left.length - right.length
    if (gap < 1) {
      this.text(left).newline()
      this.alignRight().text(right).newline().alignLeft()
    } else {
      this.text(left + ' '.repeat(gap) + right).newline()
    }
    return this
  }

  cut() {
    return this.feed(3).push(CMD.CUT_PARTIAL)
  }

  toBuffer() {
    return Buffer.concat(this.parts)
  }
}

module.exports = { EscPosBuilder, COLS }
