import enUS from './locales/en-US.js'
import zhCN from './locales/zh-CN.js'
import ruRU from './locales/ru-RU.js'

export const LANGUAGE_OPTIONS = [
  { value: 'en-US', key: 'language.english' },
  { value: 'zh-CN', key: 'language.chinese' },
  { value: 'ru-RU', key: 'language.russian' },
]

const MESSAGES = {
  'en-US': enUS,
  'zh-CN': zhCN,
  'ru-RU': ruRU,
}

function readPath(messages, key) {
  return key.split('.').reduce((value, part) => value?.[part], messages)
}

export function getInitialLanguage() {
  try {
    const saved = window.localStorage.getItem('cosight.uiLanguage')
    if (MESSAGES[saved]) return saved
  } catch {
    // Local persistence is optional in the desktop shell.
  }
  return 'en-US'
}

export function createTranslator(language) {
  const messages = MESSAGES[language] || enUS
  return (key, variables = {}) => {
    const template = readPath(messages, key) ?? readPath(enUS, key) ?? key
    return String(template).replace(/\{(\w+)\}/g, (_match, name) => String(variables[name] ?? ''))
  }
}
