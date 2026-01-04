/**
 * Text Normalizer
 * Converts text to TTS-friendly format (numbers to words, abbreviations, etc.)
 */

import numberToWords from 'number-to-words';
const { toWords, toWordsOrdinal } = numberToWords;

export class TextNormalizer {
  private abbreviations: Record<string, string> = {
    'Dr.': 'Doctor',
    'Mr.': 'Mister',
    'Mrs.': 'Missus',
    'Ms.': 'Miss',
    'Prof.': 'Professor',
    'Jr.': 'Junior',
    'Sr.': 'Senior',
    'vs.': 'versus',
    'etc.': 'etcetera',
    'e.g.': 'for example',
    'i.e.': 'that is',
    'approx.': 'approximately',
    'govt.': 'government',
    'dept.': 'department',
  };

  /** Normalize text for TTS processing */
  normalize(text: string): string {
    let result = text;

    // Handle times FIRST (before punctuation converts colons)
    result = this.normalizeTimes(result);

    // Handle decimal numbers (e.g., "3.14" -> "three point one four")
    result = this.normalizeDecimalNumbers(result);

    // Handle ordinals (1st, 2nd, 3rd, etc.)
    result = this.normalizeOrdinals(result);

    // Handle currency
    result = this.normalizeCurrency(result);

    // Handle percentages
    result = this.normalizePercentages(result);

    // Handle years
    result = this.normalizeYears(result);

    // Handle remaining standalone numbers
    result = this.normalizeStandaloneNumbers(result);

    // Handle abbreviations
    result = this.normalizeAbbreviations(result);

    // Handle symbols
    result = this.normalizeSymbols(result);

    // Handle punctuation
    result = this.normalizePunctuation(result);

    // Clean up extra spaces
    result = result.replace(/\s+/g, ' ').trim();

    return result;
  }

  private normalizeTimes(text: string): string {
    // Match times like "3:06 PM", "12:30", "10:00 AM"
    return text.replace(
      /\b(\d{1,2}):(\d{2})\s*(AM|PM|am|pm|a\.m\.|p\.m\.)?\b/g,
      (_, hourStr, minuteStr, period) => {
        const hour = parseInt(hourStr, 10);
        const minute = parseInt(minuteStr, 10);

        const hourWord = toWords(hour);

        let minuteWord: string;
        if (minute === 0) {
          // 3:00 -> "three o'clock" or just "three" if period follows
          minuteWord = period ? '' : "o'clock";
        } else if (minute < 10) {
          // 3:06 -> "three oh six"
          minuteWord = 'oh ' + toWords(minute);
        } else {
          // 3:30 -> "three thirty"
          minuteWord = toWords(minute);
        }

        const periodWord = period
          ? ' ' + period.replace(/\./g, '').toUpperCase().split('').join(' ')
          : '';

        return (hourWord + ' ' + minuteWord + periodWord).trim();
      }
    );
  }

  private normalizeDecimalNumbers(text: string): string {
    return text.replace(/(\d+)\.(\d+)/g, (_, whole, decimal) => {
      const wholeWords = toWords(parseInt(whole, 10));
      const decimalDigits = decimal
        .split('')
        .map((d: string) => toWords(parseInt(d, 10)))
        .join(' ');
      return `${wholeWords} point ${decimalDigits}`;
    });
  }

  private normalizeOrdinals(text: string): string {
    return text.replace(/(\d+)(st|nd|rd|th)\b/gi, (_, num) => {
      return toWordsOrdinal(parseInt(num, 10));
    });
  }

  private normalizeCurrency(text: string): string {
    // Handle $X.XX format
    let result = text.replace(/\$(\d+)\.(\d{2})\b/g, (_, dollars, cents) => {
      const d = parseInt(dollars, 10);
      const c = parseInt(cents, 10);
      let phrase = toWords(d) + (d === 1 ? ' dollar' : ' dollars');
      if (c > 0) {
        phrase += ' and ' + toWords(c) + (c === 1 ? ' cent' : ' cents');
      }
      return phrase;
    });

    // Handle $X format (no cents)
    result = result.replace(/\$(\d+)\b/g, (_, dollars) => {
      const d = parseInt(dollars, 10);
      return toWords(d) + (d === 1 ? ' dollar' : ' dollars');
    });

    return result;
  }

  private normalizePercentages(text: string): string {
    return text.replace(/(\d+)%/g, (_, num) => {
      return toWords(parseInt(num, 10)) + ' percent';
    });
  }

  private normalizeYears(text: string): string {
    return text.replace(/\b(1\d{3}|2\d{3})\b/g, (match) => {
      const year = parseInt(match, 10);

      // 2000-2009: "two thousand [one/two/etc]"
      if (year >= 2000 && year < 2010) {
        return 'two thousand ' + (year === 2000 ? '' : toWords(year - 2000));
      }

      // 2010-2999: "twenty twenty four"
      if (year >= 2010 && year < 3000) {
        const first = Math.floor(year / 100);
        const last = year % 100;
        return (
          toWords(first) +
          ' ' +
          (last < 10 ? 'oh ' + toWords(last) : toWords(last))
        );
      }

      // 1000-1999: "nineteen eighty four"
      if (year >= 1000 && year < 2000) {
        const first = Math.floor(year / 100);
        const last = year % 100;
        return (
          toWords(first) +
          ' ' +
          (last === 0
            ? 'hundred'
            : last < 10
            ? 'oh ' + toWords(last)
            : toWords(last))
        );
      }

      return toWords(year);
    });
  }

  private normalizeStandaloneNumbers(text: string): string {
    return text.replace(/\b(\d+)\b/g, (match) => {
      return toWords(parseInt(match, 10));
    });
  }

  private normalizeAbbreviations(text: string): string {
    let result = text;
    for (const [abbr, full] of Object.entries(this.abbreviations)) {
      result = result.replace(
        new RegExp(abbr.replace('.', '\\.'), 'gi'),
        full
      );
    }
    return result;
  }

  private normalizeSymbols(text: string): string {
    let result = text;
    result = result.replace(/&/g, ' and ');
    result = result.replace(/@/g, ' at ');
    result = result.replace(/\+/g, ' plus ');
    result = result.replace(/=/g, ' equals ');
    result = result.replace(/#(\w+)/g, 'hashtag $1'); // #word -> "hashtag word"
    result = result.replace(/#/g, ' number '); // standalone #
    return result;
  }

  private normalizePunctuation(text: string): string {
    let result = text;

    // Ellipsis -> pause
    result = result.replace(/\.\.\./g, ', ');

    // Semicolons/colons -> comma
    result = result.replace(/[;:]/g, ', ');

    // Brackets -> space
    result = result.replace(/[()[\]{}]/g, ' ');

    // Double quotes/guillemets -> remove
    result = result.replace(/[""«»]/g, '');

    // Single quotes: only remove when NOT part of contractions
    result = result.replace(/(?<!\w)[''']|['''](?!\w)/g, '');

    // Markdown formatting -> remove
    result = result.replace(/[*_~`]/g, '');

    // Hyphens -> space (TTS models often pause at hyphens)
    result = result.replace(/-/g, ' ');

    return result;
  }
}

