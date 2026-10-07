export const MAX_TRACE_LENGTH = 240;

// Count whole visible characters, including combined accents and joined emoji.
const segmenter = new Intl.Segmenter("en", { granularity: "grapheme" });
export function characterCount(text: string): number {
  return Array.from(segmenter.segment(text)).length;
}
