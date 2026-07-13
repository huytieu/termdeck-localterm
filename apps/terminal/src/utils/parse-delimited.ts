// A small RFC-4180-ish delimited parser for the CSV/TSV wiki viewer. Handles
// quoted fields, embedded delimiters/newlines, and doubled "" escapes. Not a
// full CSV library — enough to render a table faithfully for the common cases.
export const parseDelimited = (text: string, delimiter: string): string[][] => {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let inQuotes = false;
  let sawAny = false;

  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inQuotes) {
      if (c === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        field += c;
      }
      continue;
    }
    if (c === '"') {
      inQuotes = true;
      sawAny = true;
    } else if (c === delimiter) {
      row.push(field);
      field = "";
      sawAny = true;
    } else if (c === "\n") {
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
      sawAny = false;
    } else if (c === "\r") {
      // swallow; the paired \n ends the row
    } else {
      field += c;
      sawAny = true;
    }
  }
  // Flush a trailing field/row that had no final newline.
  if (sawAny || field.length > 0 || row.length > 0) {
    row.push(field);
    rows.push(row);
  }
  return rows;
};

export const delimiterFor = (path: string): string => (/\.tsv$/i.test(path) ? "\t" : ",");
