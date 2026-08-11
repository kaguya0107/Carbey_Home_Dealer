/**
 * 車種の型式世代プリセット。
 * 「プリウス30後期」のような世代名を year_min/year_max に変換するためのデータ。
 *
 * 追加・修正は随時行う。
 */
export type GenerationPreset = {
  label: string    // 表示名 例: "30後期 (2015-2018)"
  year_min: number
  year_max: number
}

export type CarGenerations = {
  [carName: string]: GenerationPreset[]
}

export const CAR_GENERATIONS: CarGenerations = {
  'プリウス': [
    { label: '60系 (2023-)',    year_min: 2023, year_max: 9999 },
    { label: '50後期 (2021-2022)', year_min: 2021, year_max: 2022 },
    { label: '50前期 (2015-2020)', year_min: 2015, year_max: 2020 },
    { label: '30後期 (2012-2015)', year_min: 2012, year_max: 2015 },
    { label: '30前期 (2009-2011)', year_min: 2009, year_max: 2011 },
    { label: '20系 (2003-2008)',  year_min: 2003, year_max: 2008 },
  ],
  'アルファード': [
    { label: '40系 (2023-)',    year_min: 2023, year_max: 9999 },
    { label: '30後期 (2020-2022)', year_min: 2020, year_max: 2022 },
    { label: '30前期 (2015-2019)', year_min: 2015, year_max: 2019 },
    { label: '20系 (2008-2014)',  year_min: 2008, year_max: 2014 },
  ],
  'ヴェルファイア': [
    { label: '40系 (2023-)',    year_min: 2023, year_max: 9999 },
    { label: '30後期 (2020-2022)', year_min: 2020, year_max: 2022 },
    { label: '30前期 (2015-2019)', year_min: 2015, year_max: 2019 },
    { label: '20系 (2008-2014)',  year_min: 2008, year_max: 2014 },
  ],
  'ハリアー': [
    { label: '80系 (2020-)',    year_min: 2020, year_max: 9999 },
    { label: '60系 (2013-2019)', year_min: 2013, year_max: 2019 },
    { label: '30系 (2003-2012)', year_min: 2003, year_max: 2012 },
  ],
  'RAV4': [
    { label: '50系 (2019-)',    year_min: 2019, year_max: 9999 },
    { label: '40系 (2013-2018)', year_min: 2013, year_max: 2018 },
    { label: '30系 (2006-2012)', year_min: 2006, year_max: 2012 },
  ],
  'クラウン': [
    { label: '220系 (2022-)',   year_min: 2022, year_max: 9999 },
    { label: '210系 (2018-2022)', year_min: 2018, year_max: 2022 },
    { label: '210系前期 (2012-2017)', year_min: 2012, year_max: 2017 },
    { label: '200系 (2008-2012)', year_min: 2008, year_max: 2012 },
  ],
  'ランドクルーザー': [
    { label: '300系 (2021-)',   year_min: 2021, year_max: 9999 },
    { label: '200系 (2007-2021)', year_min: 2007, year_max: 2021 },
    { label: '100系 (1998-2007)', year_min: 1998, year_max: 2007 },
  ],
  'ランドクルーザープラド': [
    { label: '150後期 (2017-)',  year_min: 2017, year_max: 9999 },
    { label: '150前期 (2009-2016)', year_min: 2009, year_max: 2016 },
    { label: '120系 (2002-2009)', year_min: 2002, year_max: 2009 },
  ],
  'ヴォクシー': [
    { label: '90系 (2022-)',    year_min: 2022, year_max: 9999 },
    { label: '80後期 (2019-2021)', year_min: 2019, year_max: 2021 },
    { label: '80前期 (2014-2018)', year_min: 2014, year_max: 2018 },
    { label: '70系 (2007-2013)', year_min: 2007, year_max: 2013 },
  ],
  'ノア': [
    { label: '90系 (2022-)',    year_min: 2022, year_max: 9999 },
    { label: '80後期 (2019-2021)', year_min: 2019, year_max: 2021 },
    { label: '80前期 (2014-2018)', year_min: 2014, year_max: 2018 },
    { label: '70系 (2007-2013)', year_min: 2007, year_max: 2013 },
  ],
  'セレナ': [
    { label: 'C28 (2022-)',     year_min: 2022, year_max: 9999 },
    { label: 'C27後期 (2019-2021)', year_min: 2019, year_max: 2021 },
    { label: 'C27前期 (2016-2018)', year_min: 2016, year_max: 2018 },
    { label: 'C26 (2010-2016)', year_min: 2010, year_max: 2016 },
  ],
  'ステップワゴン': [
    { label: 'RP6/7/8 (2022-)', year_min: 2022, year_max: 9999 },
    { label: 'RP1-4 (2015-2021)', year_min: 2015, year_max: 2021 },
    { label: 'RK系 (2009-2015)', year_min: 2009, year_max: 2015 },
  ],
  'フィット': [
    { label: '4代目GR (2020-)', year_min: 2020, year_max: 9999 },
    { label: '3代目GK (2013-2019)', year_min: 2013, year_max: 2019 },
    { label: '2代目GE (2007-2013)', year_min: 2007, year_max: 2013 },
  ],
  'ヴィッツ/ヤリス': [
    { label: 'ヤリス (2020-)',  year_min: 2020, year_max: 9999 },
    { label: 'ヴィッツ3代目 (2010-2019)', year_min: 2010, year_max: 2019 },
    { label: 'ヴィッツ2代目 (2005-2010)', year_min: 2005, year_max: 2010 },
  ],
  'N-BOX': [
    { label: '2代目 (2017-)',   year_min: 2017, year_max: 9999 },
    { label: '1代目 (2011-2017)', year_min: 2011, year_max: 2017 },
  ],
  'タント': [
    { label: 'LA650/660 (2019-)', year_min: 2019, year_max: 9999 },
    { label: 'LA600/610 (2013-2019)', year_min: 2013, year_max: 2019 },
    { label: 'L375/385 (2007-2013)', year_min: 2007, year_max: 2013 },
  ],
  'ムーヴ': [
    { label: 'LA150/160 (2014-)', year_min: 2014, year_max: 9999 },
    { label: 'L175/185 (2006-2014)', year_min: 2006, year_max: 2014 },
  ],
  'CX-5': [
    { label: 'KF系後期 (2021-)', year_min: 2021, year_max: 9999 },
    { label: 'KF系前期 (2017-2020)', year_min: 2017, year_max: 2020 },
    { label: 'KE系 (2012-2016)', year_min: 2012, year_max: 2016 },
  ],
  'レクサスRX': [
    { label: '5代目 (2022-)',   year_min: 2022, year_max: 9999 },
    { label: '4代目AL20後期 (2019-2022)', year_min: 2019, year_max: 2022 },
    { label: '4代目AL20前期 (2015-2018)', year_min: 2015, year_max: 2018 },
  ],
}

/** 車種名にマッチするプリセット一覧を返す。完全一致優先、部分一致でもフォールバック */
export function getGenerationPresets(carName: string): GenerationPreset[] {
  if (!carName) return []
  // 完全一致
  if (CAR_GENERATIONS[carName]) return CAR_GENERATIONS[carName]
  // 部分一致
  const key = Object.keys(CAR_GENERATIONS).find(
    (k) => carName.includes(k) || k.includes(carName)
  )
  return key ? CAR_GENERATIONS[key] : []
}

/** AIシステムプロンプト用の型式年式対応表テキストを生成 */
export function buildGenerationGuideText(): string {
  const lines: string[] = ['【主要車種の型式・世代と年式対応表】']
  for (const [car, presets] of Object.entries(CAR_GENERATIONS)) {
    const entries = presets.map((p) => {
      const maxLabel = p.year_max === 9999 ? '現在' : String(p.year_max)
      return `${p.label.split('(')[0].trim()}=${p.year_min}-${maxLabel}`
    }).join(', ')
    lines.push(`${car}: ${entries}`)
  }
  return lines.join('\n')
}
