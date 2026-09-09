/**
 * A small CSV reader. nflverse quotes any field containing a comma, so splitting
 * on commas alone corrupts names like "Smith, Jr." and every column after it.
 */
export function parseCSV(text) {
  const rows = []
  let row = []
  let field = ''
  let inQuotes = false

  for (let i = 0; i < text.length; i++) {
    const char = text[i]

    if (inQuotes) {
      if (char === '"') {
        if (text[i + 1] === '"') {
          field += '"'
          i++
        } else {
          inQuotes = false
        }
      } else {
        field += char
      }
      continue
    }

    if (char === '"') {
      inQuotes = true
    } else if (char === ',') {
      row.push(field)
      field = ''
    } else if (char === '\n') {
      row.push(field)
      rows.push(row)
      row = []
      field = ''
    } else if (char !== '\r') {
      field += char
    }
  }

  if (field.length > 0 || row.length > 0) {
    row.push(field)
    rows.push(row)
  }

  const header = rows.shift() || []
  return rows
    .filter((entry) => entry.length === header.length)
    .map((entry) => Object.fromEntries(header.map((key, index) => [key, entry[index]])))
}

export function toNumber(value) {
  if (value == null || value === '' || value === 'NA') return null
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : null
}
