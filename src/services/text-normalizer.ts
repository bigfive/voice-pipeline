/**
 * Text Normalizer
 * Converts text to TTS-friendly format
 */

import numberToWords from 'number-to-words';
const { toWords, toWordsOrdinal } = numberToWords;

export class TextNormalizer {
  normalize(text: string): string {
    let result = text;
    result = this.normalizeTimes(result);
    result = this.normalizeDecimalNumbers(result);
    result = this.normalizeOrdinals(result);
    result = this.normalizeCurrency(result);
    result = this.normalizePercentages(result);
    result = this.normalizeYears(result);
    result = this.normalizeStandaloneNumbers(result);
    result = this.normalizeSymbols(result);
    result = this.normalizePunctuation(result);
    result = result.replace(/\s+/g, ' ').trim();
    return result;
  }

  private normalizeTimes(text: string): string {
    return text.replace(
      /\b(\d{1,2}):(\d{2})\s*(AM|PM|am|pm)?\b/g,
      (_, hourStr, minuteStr, period) => {
        const hour = parseInt(hourStr, 10);
        const minute = parseInt(minuteStr, 10);
        const hourWord = toWords(hour);
        let minuteWord = minute === 0 ? '' : minute < 10 ? 'oh ' + toWords(minute) : toWords(minute);
        const periodWord = period ? ' ' + period.toUpperCase().split('').join(' ') : '';
        return (hourWord + ' ' + minuteWord + periodWord).trim();
      }
    );
  }

  private normalizeDecimalNumbers(text: string): string {
    return text.replace(/(\d+)\.(\d+)/g, (_, whole, decimal) => {
      const wholeWords = toWords(parseInt(whole, 10));
      const decimalDigits = decimal.split('').map((d: string) => toWords(parseInt(d, 10))).join(' ');
      return `${wholeWords} point ${decimalDigits}`;
    });
  }

  private normalizeOrdinals(text: string): string {
    return text.replace(/(\d+)(st|nd|rd|th)\b/gi, (_, num) => toWordsOrdinal(parseInt(num, 10)));
  }

  private normalizeCurrency(text: string): string {
    let result = text.replace(/\$(\d+)\.(\d{2})\b/g, (_, dollars, cents) => {
      const d = parseInt(dollars, 10);
      const c = parseInt(cents, 10);
      let phrase = toWords(d) + (d === 1 ? ' dollar' : ' dollars');
      if (c > 0) phrase += ' and ' + toWords(c) + (c === 1 ? ' cent' : ' cents');
      return phrase;
    });
    return result.replace(/\$(\d+)\b/g, (_, dollars) => {
      const d = parseInt(dollars, 10);
      return toWords(d) + (d === 1 ? ' dollar' : ' dollars');
    });
  }

  private normalizePercentages(text: string): string {
    return text.replace(/(\d+)%/g, (_, num) => toWords(parseInt(num, 10)) + ' percent');
  }

  private normalizeYears(text: string): string {
    return text.replace(/\b(1\d{3}|2\d{3})\b/g, (match) => {
      const year = parseInt(match, 10);
      if (year >= 2000 && year < 2010) return 'two thousand ' + (year === 2000 ? '' : toWords(year - 2000));
      if (year >= 2010 && year < 3000) {
        const first = Math.floor(year / 100);
        const last = year % 100;
        return toWords(first) + ' ' + (last < 10 ? 'oh ' + toWords(last) : toWords(last));
      }
      if (year >= 1000 && year < 2000) {
        const first = Math.floor(year / 100);
        const last = year % 100;
        return toWords(first) + ' ' + (last === 0 ? 'hundred' : last < 10 ? 'oh ' + toWords(last) : toWords(last));
      }
      return toWords(year);
    });
  }

  private normalizeStandaloneNumbers(text: string): string {
    return text.replace(/\b(\d+)\b/g, (match) => toWords(parseInt(match, 10)));
  }

  private normalizeSymbols(text: string): string {
    return text
      .replace(/&/g, ' and ')
      .replace(/@/g, ' at ')
      .replace(/\+/g, ' plus ')
      .replace(/=/g, ' equals ')
      .replace(/#(\w+)/g, 'hashtag $1')
      .replace(/#/g, ' number ');
  }

  private normalizePunctuation(text: string): string {
    return text
      .replace(/\.\.\./g, ', ')
      .replace(/[;:]/g, ', ')
      .replace(/[()[\]{}]/g, ' ')
      .replace(/[""«»]/g, '')
      .replace(/(?<!\w)[''']|['''](?!\w)/g, '')
      .replace(/[*_~`]/g, '')
      .replace(/-/g, ' ');
  }
}

