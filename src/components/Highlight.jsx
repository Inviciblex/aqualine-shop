// Подсвечивает вхождения поискового запроса в тексте.
export default function Highlight({ text, term }) {
  const t = (term || '').trim()
  if (!t || !text) return text || null

  const lower = text.toLowerCase()
  const needle = t.toLowerCase()
  const parts = []
  let i = 0
  let from = 0
  while ((i = lower.indexOf(needle, from)) !== -1) {
    if (i > from) parts.push(text.slice(from, i))
    parts.push(
      <mark className="mark" key={i}>
        {text.slice(i, i + needle.length)}
      </mark>,
    )
    from = i + needle.length
  }
  if (from < text.length) parts.push(text.slice(from))
  return parts
}
