/**
 * Script injetado pela extensão local de região em todas as páginas e frames
 * (mundo MAIN, document_start), antes de qualquer script do site.
 *
 * - Fuso horário: o Chromium no Windows ignora a variável TZ, então `Date`,
 *   `Intl.DateTimeFormat` e `Temporal.Now` passam a calcular no fuso escolhido.
 * - Geolocalização: `navigator.geolocation` devolve as coordenadas configuradas.
 *
 * É mantido como texto puro (sem template strings internas) para não passar pelo bundler.
 * Chamado como: (SOURCE)(config)
 */
export const REGION_INJECT_SOURCE = String.raw`function (config) {
  'use strict'
  if (globalThis.__zenxRegionApplied) return
  Object.defineProperty(globalThis, '__zenxRegionApplied', { value: true })

  // ---------- disfarce: funções substituídas aparecem como nativas ----------
  const nativeFnToString = Function.prototype.toString
  const disguised = new WeakMap()
  const disguise = (fn, name) => {
    disguised.set(fn, 'function ' + name + '() { [native code] }')
    return fn
  }
  const fnToString = {
    toString() {
      return disguised.has(this) ? disguised.get(this) : nativeFnToString.call(this)
    }
  }.toString
  disguise(fnToString, 'toString')
  Object.defineProperty(Function.prototype, 'toString', { value: fnToString, writable: true, configurable: true, enumerable: false })

  /** Cria um método sem 'prototype' (como os nativos) com nome e length corretos. */
  const method = (name, length, impl) => {
    const fn = { [name](...args) { return impl.apply(this, args) } }[name]
    Object.defineProperty(fn, 'length', { value: length, configurable: true })
    return disguise(fn, name)
  }
  const replace = (target, name, length, impl) => {
    const desc = Object.getOwnPropertyDescriptor(target, name)
    Object.defineProperty(target, name, {
      value: method(name, length, impl),
      writable: desc ? desc.writable : true,
      enumerable: desc ? desc.enumerable : false,
      configurable: true
    })
  }

  // ---------- fuso horário ----------
  if (config.timezone) {
    const TZ = config.timezone
    const OrigDate = Date
    const DP = OrigDate.prototype
    const getTime = DP.getTime
    const setTime = DP.setTime
    const nativeOffset = DP.getTimezoneOffset
    const nativeParse = OrigDate.parse
    const nativeUTC = OrigDate.UTC
    const OrigDTF = Intl.DateTimeFormat
    const nativeToLocaleString = DP.toLocaleString
    const nativeToLocaleDateString = DP.toLocaleDateString
    const nativeToLocaleTimeString = DP.toLocaleTimeString
    const U = {
      FullYear: [DP.getUTCFullYear, DP.setUTCFullYear],
      Month: [DP.getUTCMonth, DP.setUTCMonth],
      Date: [DP.getUTCDate, DP.setUTCDate],
      Hours: [DP.getUTCHours, DP.setUTCHours],
      Minutes: [DP.getUTCMinutes, DP.setUTCMinutes],
      Seconds: [DP.getUTCSeconds, DP.setUTCSeconds],
      Milliseconds: [DP.getUTCMilliseconds, DP.setUTCMilliseconds]
    }
    const getUTCDay = DP.getUTCDay

    const partsFmt = new OrigDTF('en-US', {
      timeZone: TZ,
      hourCycle: 'h23',
      era: 'short',
      year: 'numeric',
      month: 'numeric',
      day: 'numeric',
      hour: 'numeric',
      minute: 'numeric',
      second: 'numeric'
    })
    const formatToParts = OrigDTF.prototype.formatToParts

    const cache = new Map()
    /** Diferença (ms) entre a hora local do fuso e o UTC no instante t. */
    const offsetAt = (t) => {
      if (t !== t) return NaN
      const key = Math.floor(t / 60000)
      const hit = cache.get(key)
      if (hit !== undefined) return hit
      const second = t - (((t % 1000) + 1000) % 1000)
      const fields = {}
      for (const p of formatToParts.call(partsFmt, new OrigDate(second))) fields[p.type] = p.value
      let year = Number(fields.year)
      if (fields.era === 'BC' || fields.era === 'B') year = 1 - year
      const d = new OrigDate(0)
      U.FullYear[1].call(d, year, Number(fields.month) - 1, Number(fields.day))
      U.Hours[1].call(d, Number(fields.hour), Number(fields.minute), Number(fields.second), 0)
      const offset = getTime.call(d) - second
      if (cache.size > 2000) cache.clear()
      cache.set(key, offset)
      return offset
    }
    /** Converte "campos locais lidos como UTC" para o instante real. */
    const localToUtc = (local) => {
      if (local !== local) return NaN
      const first = local - offsetAt(local)
      const second = local - offsetAt(first)
      return offsetAt(second) === offsetAt(first) ? second : Math.min(first, second)
    }
    const localView = (date) => {
      const t = getTime.call(date)
      return t !== t ? null : new OrigDate(t + offsetAt(t))
    }

    // getters locais
    for (const name of ['FullYear', 'Month', 'Date', 'Hours', 'Minutes', 'Seconds', 'Milliseconds']) {
      const getter = U[name][0]
      replace(DP, 'get' + name, 0, function () {
        const v = localView(this)
        return v ? getter.call(v) : NaN
      })
    }
    replace(DP, 'getDay', 0, function () {
      const v = localView(this)
      return v ? getUTCDay.call(v) : NaN
    })
    replace(DP, 'getYear', 0, function () {
      const v = localView(this)
      return v ? U.FullYear[0].call(v) - 1900 : NaN
    })
    replace(DP, 'getTimezoneOffset', 0, function () {
      const t = getTime.call(this)
      if (t !== t) return NaN
      const v = -offsetAt(t) / 60000
      return v === 0 ? 0 : v
    })

    // setters locais
    const setters = { FullYear: 3, Month: 2, Date: 1, Hours: 4, Minutes: 3, Seconds: 2, Milliseconds: 1 }
    for (const name of Object.keys(setters)) {
      const utcSetter = U[name][1]
      replace(DP, 'set' + name, setters[name], function (...args) {
        const t = getTime.call(this)
        let base
        if (t === t) base = t + offsetAt(t)
        else if (name === 'FullYear') base = 0
        else return NaN
        const d = new OrigDate(base)
        utcSetter.apply(d, args)
        const result = localToUtc(getTime.call(d))
        setTime.call(this, result)
        return getTime.call(this)
      })
    }
    replace(DP, 'setYear', 1, function (year) {
      let y = Number(year)
      if (y !== y) {
        setTime.call(this, NaN)
        return NaN
      }
      const yi = Math.trunc(y)
      if (yi >= 0 && yi <= 99) y = 1900 + yi
      return DP.setFullYear.call(this, y)
    })

    // textos
    const pad = (n, size) => String(Math.abs(n)).padStart(size, '0')
    const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
    const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
    const yearText = (y) => (y < 0 ? '-' + pad(y, 6) : pad(y, 4))
    let nameFmt = null
    const zoneName = (t) => {
      try {
        nameFmt = nameFmt || new OrigDTF(undefined, { timeZone: TZ, timeZoneName: 'long' })
        const part = formatToParts.call(nameFmt, new OrigDate(t)).find((p) => p.type === 'timeZoneName')
        return part ? part.value : TZ
      } catch (e) {
        return TZ
      }
    }
    const dateText = (v) =>
      DAYS[getUTCDay.call(v)] + ' ' + MONTHS[U.Month[0].call(v)] + ' ' + pad(U.Date[0].call(v), 2) + ' ' + yearText(U.FullYear[0].call(v))
    const timeText = (v, t) => {
      const off = Math.round(offsetAt(t) / 60000)
      const sign = off < 0 ? '-' : '+'
      return (
        pad(U.Hours[0].call(v), 2) + ':' + pad(U.Minutes[0].call(v), 2) + ':' + pad(U.Seconds[0].call(v), 2) +
        ' GMT' + sign + pad(Math.floor(Math.abs(off) / 60), 2) + pad(Math.abs(off) % 60, 2) + ' (' + zoneName(t) + ')'
      )
    }
    const fullText = (date) => {
      const v = localView(date)
      return v ? dateText(v) + ' ' + timeText(v, getTime.call(date)) : 'Invalid Date'
    }
    replace(DP, 'toString', 0, function () {
      return fullText(this)
    })
    replace(DP, 'toDateString', 0, function () {
      const v = localView(this)
      return v ? dateText(v) : 'Invalid Date'
    })
    replace(DP, 'toTimeString', 0, function () {
      const v = localView(this)
      return v ? timeText(v, getTime.call(this)) : 'Invalid Date'
    })
    const withZone = (options) => {
      if (options === undefined || options === null) return { timeZone: TZ }
      const o = Object(options)
      return o.timeZone === undefined ? Object.assign({}, o, { timeZone: TZ }) : o
    }
    replace(DP, 'toLocaleString', 0, function (locales, options) {
      return nativeToLocaleString.call(this, locales, withZone(options))
    })
    replace(DP, 'toLocaleDateString', 0, function (locales, options) {
      return nativeToLocaleDateString.call(this, locales, withZone(options))
    })
    replace(DP, 'toLocaleTimeString', 0, function (locales, options) {
      return nativeToLocaleTimeString.call(this, locales, withZone(options))
    })

    // interpretação de textos sem fuso explícito como hora local do fuso escolhido
    const DATE_ONLY = /^\s*[+-]?\d{4,6}(-\d\d(-\d\d)?)?\s*$/
    const HAS_ZONE = /(\dZ\b|[+-]\d\d:?\d\d\s*(\(.*\))?\s*$|\b(GMT|UTC|UT)\b|\b[ECMP][SD]T\b)/i
    const parseLocal = (text) => {
      const s = String(text)
      const t = nativeParse(s)
      if (t !== t || DATE_ONLY.test(s) || HAS_ZONE.test(s)) return t
      // O nativo leu os campos no fuso do Windows; recupera os campos e reinterpreta no fuso escolhido.
      const fieldsUtc = t - nativeOffset.call(new OrigDate(t)) * 60000
      return localToUtc(fieldsUtc)
    }
    Object.defineProperty(OrigDate, 'parse', {
      value: method('parse', 1, (s) => parseLocal(s)),
      writable: true,
      configurable: true,
      enumerable: false
    })

    const DateProxy = new Proxy(OrigDate, {
      construct(target, args, newTarget) {
        if (args.length >= 2) {
          const local = nativeUTC.apply(OrigDate, args)
          return Reflect.construct(target, [localToUtc(local)], newTarget)
        }
        if (args.length === 1 && typeof args[0] === 'string') {
          return Reflect.construct(target, [parseLocal(args[0])], newTarget)
        }
        return Reflect.construct(target, args, newTarget)
      },
      apply() {
        return fullText(new OrigDate())
      }
    })
    Object.defineProperty(DP, 'constructor', { value: DateProxy, writable: true, configurable: true, enumerable: false })
    globalThis.Date = DateProxy

    const DTFProxy = new Proxy(OrigDTF, {
      construct(target, args, newTarget) {
        return Reflect.construct(target, [args[0], withZone(args[1])], newTarget === DTFProxy ? target : newTarget)
      },
      apply(target, thisArg, args) {
        return Reflect.construct(target, [args[0], withZone(args[1])])
      }
    })
    Object.defineProperty(OrigDTF.prototype, 'constructor', { value: DTFProxy, writable: true, configurable: true, enumerable: false })
    Intl.DateTimeFormat = DTFProxy

    const T = globalThis.Temporal
    if (T && T.Now) {
      const now = T.Now
      replace(now, 'timeZoneId', 0, () => TZ)
      for (const name of ['plainDateTimeISO', 'plainDateISO', 'plainTimeISO', 'zonedDateTimeISO']) {
        const original = now[name]
        if (typeof original === 'function') {
          replace(now, name, 0, (zone) => original.call(now, zone === undefined ? TZ : zone))
        }
      }
    }
  }

  // ---------- geolocalização ----------
  if (config.geo && typeof Geolocation !== 'undefined') {
    const { latitude, longitude, accuracy } = config.geo
    const makePosition = () => {
      const coordsData = {
        latitude,
        longitude,
        accuracy,
        altitude: null,
        altitudeAccuracy: null,
        heading: null,
        speed: null
      }
      const coords = Object.create(GeolocationCoordinates.prototype)
      for (const key of Object.keys(coordsData)) {
        Object.defineProperty(coords, key, { value: coordsData[key], enumerable: true })
      }
      Object.defineProperty(coords, 'toJSON', { value: () => Object.assign({}, coordsData) })
      const position = Object.create(GeolocationPosition.prototype)
      const timestamp = Date.now()
      Object.defineProperty(position, 'coords', { value: coords, enumerable: true })
      Object.defineProperty(position, 'timestamp', { value: timestamp, enumerable: true })
      Object.defineProperty(position, 'toJSON', { value: () => ({ coords: Object.assign({}, coordsData), timestamp }) })
      return position
    }
    const GP = Geolocation.prototype
    const timers = new Map()
    let nextId = 1
    const deliver = (success) => {
      if (typeof success !== 'function') throw new TypeError("Failed to execute on 'Geolocation': The callback provided as parameter 1 is not a function.")
      return setTimeout(() => success(makePosition()), 40 + Math.floor(Math.random() * 80))
    }
    replace(GP, 'getCurrentPosition', 1, (success) => {
      deliver(success)
    })
    replace(GP, 'watchPosition', 1, (success) => {
      const id = nextId++
      timers.set(id, deliver(success))
      return id
    })
    replace(GP, 'clearWatch', 1, (id) => {
      clearTimeout(timers.get(id))
      timers.delete(id)
    })

    if (typeof Permissions !== 'undefined') {
      const query = Permissions.prototype.query
      replace(Permissions.prototype, 'query', 1, function (descriptor) {
        if (descriptor && descriptor.name === 'geolocation') {
          const status = Object.create(PermissionStatus.prototype)
          Object.defineProperty(status, 'state', { value: 'granted', enumerable: true })
          Object.defineProperty(status, 'name', { value: 'geolocation', enumerable: true })
          Object.defineProperty(status, 'onchange', { value: null, writable: true, enumerable: true })
          return Promise.resolve(status)
        }
        return query.call(this, descriptor)
      })
    }
  }
}`
