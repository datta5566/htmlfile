'use strict';
const assert = require('assert');
const { parseSticker, cleanPartDescription } = require('../app/src/main/assets/sticker-parser.js');

const cases = [
  {
    raw: '37247767$3825$UNIT 1$KNEST$260$WXS(S=1250)$1200$S25O1R208$(0.312)',
    expected: { barcode: '37247767', ipo: '3825', width: 260, partDescription: 'WXS', length: 1200, project: 'S25O1R208' }
  },
  {
    raw: '37263547$3835$UNIT 2$KNEST$260$T$350$S25SBR179$(0.091)',
    expected: { barcode: '37263547', ipo: '3835', width: 260, partDescription: 'T', length: 350, project: 'S25SBR179' }
  },
  {
    raw: '37649056$3996$UNIT B$KNEST$350$SB(GD)$950$S26VBA059$(0.3325)',
    expected: { barcode: '37649056', ipo: '3996', width: 350, partDescription: 'SB', length: 950, project: 'S26VBA059' }
  },
  {
    raw: '{600}-D-{1200}',
    expected: { width: 600, partDescription: 'D', length: 1200 }
  }
];

for (const testCase of cases) {
  const actual = parseSticker(testCase.raw);
  for (const [key, value] of Object.entries(testCase.expected)) {
    assert.strictEqual(actual[key], value, `${key} mismatch for ${testCase.raw}`);
  }
  assert.ok(actual.diagonal > 0, 'Diagonal must be positive');
}

assert.strictEqual(cleanPartDescription(' WXS(S=1250) '), 'WXS');
assert.strictEqual(cleanPartDescription('SB(GD)'), 'SB');
assert.throws(() => parseSticker('37263547'), /Width और Length/);
assert.throws(() => parseSticker(''), /empty/);
console.log('Sticker parser tests passed:', cases.length);
