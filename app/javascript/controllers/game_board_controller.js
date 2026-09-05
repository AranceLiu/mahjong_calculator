import { Controller } from "@hotwired/stimulus"

// Tracks the 4 players sitting at the table (names, running totals, who's
// dealer, wind seat) and settles each hand's money once you tell it the
// tai count. All of this lives in localStorage only — there's no backend,
// so it's private to this browser and survives page reloads but not
// clearing site data.
const STORAGE_KEY = "mahjong_game_state_v1"
const DEFAULT_NAMES = ["Arance", "Ashley", "Harun", "Eva"]
const WIND_LABELS = ["東", "南", "西", "北"]

const RATE_PRESETS = [
  { label: "50 底 / 20 台", base: 50, perTai: 20 },
  { label: "0 底 / 10 台", base: 0, perTai: 10 },
  { label: "100 底 / 30 台", base: 100, perTai: 30 }
]

export default class extends Controller {
  static targets = [
    "playerCard", "playerName", "playerTotal", "playerWind", "dealerRadio", "dealerStreak",
    "flatBase", "unitPrice", "ratePreset",
    "winnerRadio", "winTypeRadio",
    "discarderSection", "discarderRadio", "log",
    "taiInput"
  ]

  connect() {
    this.state = this.load()
    this.renderPlayers()
    this.renderLog()
    this.updateDiscarderVisibility()
    this.onWinnerChange()
  }

  load() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY)
      if (raw) {
        const parsed = JSON.parse(raw)
        return {
          names: Array.isArray(parsed.names) && parsed.names.length === 4 ? parsed.names : [...DEFAULT_NAMES],
          totals: Array.isArray(parsed.totals) && parsed.totals.length === 4 ? parsed.totals : [0, 0, 0, 0],
          dealerIndex: Number.isInteger(parsed.dealerIndex) ? parsed.dealerIndex : 0,
          flatBase: typeof parsed.flatBase === "number" ? parsed.flatBase : 50,
          unitPrice: typeof parsed.unitPrice === "number" ? parsed.unitPrice : 20,
          round: Number.isInteger(parsed.round) ? parsed.round : 1,
          log: Array.isArray(parsed.log) ? parsed.log : [],
          dealerStreak: Number.isInteger(parsed.dealerStreak) ? parsed.dealerStreak : 0
        }
      }
    } catch (e) {
      // corrupt storage, fall through to defaults
    }
    return { names: [...DEFAULT_NAMES], totals: [0, 0, 0, 0], dealerIndex: 0, flatBase: 50, unitPrice: 20, round: 1, log: [], dealerStreak: 0 }
  }

  persist() {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(this.state))
  }

  renderPlayers() {
    this.playerNameTargets.forEach((el, i) => { el.value = this.state.names[i] })

    this.playerTotalTargets.forEach((el, i) => {
      const total = this.state.totals[i]
      el.textContent = (total > 0 ? "+" : "") + total
      el.classList.toggle("text-emerald-600", total > 0)
      el.classList.toggle("text-red-600", total < 0)
      el.classList.toggle("text-gray-500", total === 0)
    })

    this.playerWindTargets.forEach((el, i) => {
      el.textContent = WIND_LABELS[i]
    })

    this.dealerRadioTargets.forEach((el, i) => { el.checked = i === this.state.dealerIndex })

    this.playerCardTargets.forEach((el, i) => {
      const isDealer = i === this.state.dealerIndex
      el.classList.toggle("border-amber-400", isDealer)
      el.classList.toggle("ring-2", isDealer)
      el.classList.toggle("ring-amber-200", isDealer)
      el.classList.toggle("bg-amber-50", isDealer)
      el.classList.toggle("border-gray-200", !isDealer)
      el.classList.toggle("bg-white", !isDealer)
    })

    this.dealerStreakTargets.forEach((el, i) => {
      const isDealer = i === this.state.dealerIndex
      if (isDealer && this.state.dealerStreak > 0) {
        el.textContent = `連莊 x${this.state.dealerStreak}`
        el.classList.remove("hidden")
      } else {
        el.classList.add("hidden")
      }
    })

    this.flatBaseTarget.value = this.state.flatBase
    this.unitPriceTarget.value = this.state.unitPrice
    this.renderLabels()
  }

  // Winner/discarder/dealer radio buttons show the player's live name as
  // their label, so renaming a player updates every picker at once.
  renderLabels() {
    ;[this.dealerRadioTargets, this.winnerRadioTargets, this.discarderRadioTargets].forEach((group) => {
      group.forEach((el, i) => {
        const label = el.closest("label")
        const nameSpan = label?.querySelector("[data-role='name']")
        if (nameSpan) nameSpan.textContent = this.state.names[i]
      })
    })
  }

  updateName(event) {
    const i = Number(event.currentTarget.dataset.index)
    this.state.names[i] = event.currentTarget.value.trim() || DEFAULT_NAMES[i]
    this.persist()
    this.renderLabels()
  }

  updateFlatBase(event) {
    this.state.flatBase = Number(event.currentTarget.value) || 0
    this.ratePresetTarget.value = "custom"
    this.persist()
  }

  updateUnitPrice(event) {
    this.state.unitPrice = Number(event.currentTarget.value) || 0
    this.ratePresetTarget.value = "custom"
    this.persist()
  }

  applyRatePreset(event) {
    const index = event.currentTarget.value
    if (index === "custom") return
    const preset = RATE_PRESETS[Number(index)]
    if (!preset) return
    this.state.flatBase = preset.base
    this.state.unitPrice = preset.perTai
    this.persist()
    this.renderPlayers()
  }

  setDealer(event) {
    const newIndex = Number(event.currentTarget.value)
    if (newIndex !== this.state.dealerIndex) this.state.dealerStreak = 0
    this.state.dealerIndex = newIndex
    this.persist()
    this.renderPlayers()
  }

  onWinTypeChange() {
    this.updateDiscarderVisibility()
  }

  updateDiscarderVisibility() {
    const selected = this.winTypeRadioTargets.find((r) => r.checked)
    const isDiscard = selected?.value === "discard"
    this.discarderSectionTarget.classList.toggle("hidden", !isDiscard)
  }

  // 胡牌的人不能同時是放槍的人，所以他自己那個選項要停用（如果剛好選到就取消勾選）。
  onWinnerChange() {
    const winnerEl = this.winnerRadioTargets.find((r) => r.checked)
    const winnerIdx = winnerEl ? Number(winnerEl.value) : null

    this.discarderRadioTargets.forEach((el, i) => {
      const disable = i === winnerIdx
      el.disabled = disable
      if (disable && el.checked) el.checked = false
      const label = el.closest("label")
      label?.classList.toggle("opacity-40", disable)
      label?.classList.toggle("cursor-not-allowed", disable)
    })
  }

  settle() {
    const raw = this.taiInputTarget.value.trim()
    const tai = Number(raw)
    if (raw === "" || Number.isNaN(tai) || tai < 0) {
      alert("請先在上面填入這把的台數（可以是 0 台）")
      return
    }

    const winnerEl = this.winnerRadioTargets.find((r) => r.checked)
    if (!winnerEl) { alert("請選擇胡牌的人"); return }
    const winnerIdx = Number(winnerEl.value)

    const winTypeEl = this.winTypeRadioTargets.find((r) => r.checked)
    const winType = winTypeEl ? winTypeEl.value : "self"

    const dealerIdx = this.state.dealerIndex
    // 莊家台：不管誰胡牌，莊家自己要付/收的那份錢永遠算進莊家台——
    // 上莊（連莊0次）1台，連莊N次是 2N+1 台（連莊1是3台、連莊2是5台...）。
    // 真正的閒家（不是莊家、也沒讓莊家参與這筆）只算原本的台數，不用加。
    const dealerBonusTai = 2 * this.state.dealerStreak + 1
    const basePayment = this.state.flatBase + tai * this.state.unitPrice
    const dealerPayment = this.state.flatBase + (tai + dealerBonusTai) * this.state.unitPrice
    const deltas = [0, 0, 0, 0]
    let discarderIdx = null
    let dealerInvolved

    if (winType === "self") {
      // 自摸時，莊家如果不是贏家，一定是三個要付錢的人之一，逃不掉莊家台。
      dealerInvolved = true
      for (let i = 0; i < 4; i++) {
        if (i === winnerIdx) continue
        const amount = (winnerIdx === dealerIdx || i === dealerIdx) ? dealerPayment : basePayment
        deltas[i] -= amount
        deltas[winnerIdx] += amount
      }
    } else {
      const discarderEl = this.discarderRadioTargets.find((r) => r.checked)
      if (!discarderEl) { alert("請選擇放槍的人"); return }
      discarderIdx = Number(discarderEl.value)
      if (discarderIdx === winnerIdx) { alert("放槍的人不能跟胡牌的人一樣"); return }
      dealerInvolved = winnerIdx === dealerIdx || discarderIdx === dealerIdx
      const amount = dealerInvolved ? dealerPayment : basePayment
      deltas[discarderIdx] -= amount
      deltas[winnerIdx] += amount
    }

    for (let i = 0; i < 4; i++) this.state.totals[i] += deltas[i]

    this.state.log.unshift({
      round: this.state.round,
      winner: this.state.names[winnerIdx],
      tai,
      dealerBonusTai: dealerInvolved ? dealerBonusTai : 0,
      winType,
      deltas: deltas.map((delta, i) => ({ name: this.state.names[i], delta }))
    })
    this.state.log = this.state.log.slice(0, 30)
    this.state.round += 1

    // 莊家連莊：胡牌的人是莊家就留任並累加連莊次數，否則換下一位（順序：0→1→2→3→0）並歸零
    if (winnerIdx === dealerIdx) {
      this.state.dealerStreak += 1
    } else {
      this.state.dealerIndex = (dealerIdx + 1) % 4
      this.state.dealerStreak = 0
    }

    this.persist()
    window.location = "/"
  }

  resetScores() {
    if (!confirm("確定要重設所有人的分數嗎？這個動作無法復原。")) return
    this.state.totals = [0, 0, 0, 0]
    this.state.log = []
    this.state.round = 1
    this.state.dealerStreak = 0
    this.persist()
    this.renderPlayers()
    this.renderLog()
  }

  renderLog() {
    if (!this.hasLogTarget) return

    if (this.state.log.length === 0) {
      this.logTarget.innerHTML = `<p class="text-sm text-gray-400">還沒有結算紀錄</p>`
      return
    }

    this.logTarget.innerHTML = this.state.log.map((entry) => `
      <div class="text-xs border-b py-1.5">
        <div>第 ${entry.round} 局・${entry.winner} ${entry.winType === "self" ? "自摸" : "胡牌"}・${entry.tai} 台${entry.dealerBonusTai ? `＋莊家台 ${entry.dealerBonusTai}` : ""}</div>
        <div class="text-gray-500">${entry.deltas.filter((d) => d.delta !== 0).map((d) => `${d.name} ${d.delta > 0 ? "+" : ""}${d.delta}`).join("　")}</div>
      </div>
    `).join("")
  }
}
