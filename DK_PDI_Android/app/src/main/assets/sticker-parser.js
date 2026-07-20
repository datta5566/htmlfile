(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  root.DKStickerParser = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  function normalizeText(value) {
    return String(value == null ? '' : value).replace(/\s+/g, ' ').trim();
  }

  function cleanPartDescription(value) {
    return normalizeText(value)
      .replace(/\([^)]*\)/g, '')
      .replace(/[{}]/g, '')
      .replace(/^[-_\s]+|[-_\s]+$/g, '')
      .replace(/\s+/g, ' ')
      .trim();
  }

  function positiveNumber(value, label) {
    const number = Number(value);
    if (!Number.isFinite(number) || number <= 0) {
      throw new Error(label + ' invalid है।');
    }
    return number;
  }

  function parseDelimited(raw) {
    const parts = raw.split('$').map(normalizeText);
    if (parts.length < 7) throw new Error('QR format incomplete है।');

    return {
      raw: raw,
      barcode: parts[0] || '',
      ipo: parts[1] || '',
      unit: parts[2] || '',
      stickerCompany: parts[3] || '',
      width: positiveNumber(parts[4], 'Width'),
      partRaw: parts[5] || '',
      length: positiveNumber(parts[6], 'Length'),
      project: parts[7] || '',
      area: parts[8] || ''
    };
  }

  function parseDescription(raw) {
    const clean = normalizeText(raw.replace(/[{}]/g, ' ').replace(/[-_]/g, ' '));
    const numbers = clean.match(/\d+(?:\.\d+)?/g) || [];
    if (numbers.length < 2) throw new Error('Width और Length नहीं मिले।');

    const first = numbers[0];
    const last = numbers[numbers.length - 1];
    const firstIndex = clean.indexOf(first);
    const lastIndex = clean.lastIndexOf(last);

    return {
      raw: raw,
      barcode: '',
      ipo: '',
      unit: '',
      stickerCompany: '',
      width: positiveNumber(first, 'Width'),
      partRaw: clean.slice(firstIndex + first.length, lastIndex).trim(),
      length: positiveNumber(last, 'Length'),
      project: '',
      area: ''
    };
  }

  function parseSticker(value) {
    const raw = normalizeText(value);
    if (!raw) throw new Error('Sticker data empty है।');

    const result = raw.indexOf('$') >= 0 ? parseDelimited(raw) : parseDescription(raw);
    result.partDescription = cleanPartDescription(result.partRaw);
    if (!result.partDescription) throw new Error('Part Description नहीं मिला।');

    result.fullPartDescription = result.width + ' ' + result.partRaw + ' ' + result.length;
    result.diagonal = Math.sqrt((result.width * result.width) + (result.length * result.length));
    if (!Number.isFinite(result.diagonal)) throw new Error('Diagonal calculate नहीं हुआ।');
    return result;
  }

  return {
    cleanPartDescription: cleanPartDescription,
    parseSticker: parseSticker
  };
});
