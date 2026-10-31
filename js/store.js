/**
 * 本地存储：设置、昵称、成绩记录。
 * 所有数据只留在浏览器本地，不上传服务器。
 */
import { STORAGE_KEYS, DEFAULT_NICKNAME, LEADERBOARD_SEED, rankForScore } from './config.js'

function readJson(key, fallback) {
  try {
    const raw = localStorage.getItem(key)
    if (!raw) return fallback
    const parsed = JSON.parse(raw)
    return parsed ?? fallback
  } catch (err) {
    console.warn('[store] 读取失败', key, err)
    return fallback
  }
}

function writeJson(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value))
  } catch (err) {
    console.warn('[store] 写入失败', key, err)
  }
}

const DEFAULT_SETTINGS = { sound: true }

export function getSettings() {
  return { ...DEFAULT_SETTINGS, ...readJson(STORAGE_KEYS.settings, {}) }
}

export function setSettings(patch) {
  const next = { ...getSettings(), ...patch }
  writeJson(STORAGE_KEYS.settings, next)
  return next
}

export function getNickname() {
  const name = readJson(STORAGE_KEYS.nickname, '')
  return typeof name === 'string' && name.trim() ? name : DEFAULT_NICKNAME
}

export function setNickname(name) {
  const cleaned = sanitizeNickname(name)
  writeJson(STORAGE_KEYS.nickname, cleaned)
  return cleaned
}

export function sanitizeNickname(name) {
  const cleaned = String(name ?? '')
    .replace(/[\u0000-\u001f\u007f]/g, '')
    .trim()
    .slice(0, 12)
  return cleaned || DEFAULT_NICKNAME
}

/** 历史成绩（最多保留 60 条） */
export function getResults() {
  const list = readJson(STORAGE_KEYS.results, [])
  return Array.isArray(list) ? list : []
}

export function addResult(result) {
  if (!result || typeof result.score !== 'number') return getResults()
  const entry = {
    id: result.id || 'r_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
    name: sanitizeNickname(result.nickname),
    score: Number(result.score),
    rankId: result.rankId || rankForScore(result.score).id,
    metrics: result.metrics || null,
    confidence: result.confidence ?? null,
    date: result.date || new Date().toISOString(),
    module: result.module || 'naiwa',
    frames: result.frames || null,
    duration: result.duration || null,
    analyzerVersion: result.analyzerVersion || null,
    analysisMode: result.analysisMode || 'motion',
    challengeId: result.challengeId || null,
    challengeName: result.challengeName || null,
  }
  const list = getResults().filter((r) => r.id !== entry.id)
  list.unshift(entry)
  writeJson(STORAGE_KEYS.results, list.slice(0, 60))
  return list
}

export function clearResults() {
  writeJson(STORAGE_KEYS.results, [])
}

export function getCurrentResult() {
  try {
    const raw = sessionStorage.getItem(STORAGE_KEYS.current)
    return raw ? JSON.parse(raw) : null
  } catch {
    return null
  }
}

export function setCurrentResult(result) {
  try {
    if (result) sessionStorage.setItem(STORAGE_KEYS.current, JSON.stringify(result))
    else sessionStorage.removeItem(STORAGE_KEYS.current)
  } catch (err) {
    console.warn('[store] 当前成绩写入失败', err)
  }
}

/** 合并演示种子与我的成绩，按分数排序 */
export function getLeaderboard() {
  const mine = getResults()
    .filter((r) => r.module === 'naiwa')
    .map((r) => ({
      id: r.id,
      name: r.name,
      score: r.score,
      date: r.date.slice(0, 10),
      mine: true,
    }))
  const seed = LEADERBOARD_SEED.map((entry) => ({
    ...entry,
    mine: false,
  }))
  return [...mine, ...seed].sort((a, b) => b.score - a.score)
}

/** 首页榜单预览：取前 N（优先展示真实成绩在榜时的高亮） */
export function getTopScores(n = 5) {
  return getLeaderboard().slice(0, n)
}

export function getBestResult() {
  return getResults().reduce((best, r) => (!best || r.score > best.score ? r : best), null)
}

export function totalCount() {
  return 114514 + getResults().length
}
