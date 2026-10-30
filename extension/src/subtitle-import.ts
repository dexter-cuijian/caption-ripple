export interface ImportedCue { start: number; end: number; text: string }

function time(value: string): number | null {
 const match = value.trim().match(/^(?:(\d{1,2}):)?(\d{2}):(\d{2})[,.](\d{3})$/);
 if (!match) return null;
 const [, hours = '0', minutes, seconds, milliseconds] = match;
 const parts = [Number(hours), Number(minutes), Number(seconds), Number(milliseconds)];
 if (parts[1] > 59 || parts[2] > 59 || parts.some(part => !Number.isFinite(part))) return null;
 return parts[0] * 3600 + parts[1] * 60 + parts[2] + parts[3] / 1000;
}

/** Parse ordinary SRT and WebVTT cues without treating subtitle markup as HTML. */
export function parseSubtitleFile(input: string): ImportedCue[] {
 const source = input.replace(/^\uFEFF/, '').replace(/\r\n?/g, '\n');
 const blocks = source.split(/\n\s*\n/);
 const cues: ImportedCue[] = [];
 for (const block of blocks) {
  const lines = block.split('\n').map(line => line.trim());
  if (!lines.length || /^(WEBVTT|NOTE(?:\s|$)|STYLE(?:\s|$)|REGION(?:\s|$))/i.test(lines[0])) continue;
  const timingIndex = lines.findIndex(line => line.includes('-->'));
  if (timingIndex < 0 || timingIndex > 1) continue;
  const match = lines[timingIndex].match(/^([^\s]+)\s*-->\s*([^\s]+)/);
  if (!match) continue;
  const start = time(match[1]), end = time(match[2]);
  if (start === null || end === null || end <= start) continue;
  const text = lines.slice(timingIndex + 1).join('\n').replace(/<[^>]*>/g, '').replace(/\{\\[^}]*\}/g, '').trim();
  if (!text) continue;
  cues.push({start, end, text});
  if (cues.length > 20000) throw new Error('字幕文件超过 20000 条，请拆分后导入');
 }
 if (!cues.length) throw new Error('没有找到有效的 SRT/VTT 字幕');
 return cues.sort((a, b) => a.start - b.start || a.end - b.end);
}

export function activeCue(cues: ImportedCue[], second: number): {cue: ImportedCue; index: number} | null {
 if (!Number.isFinite(second)) return null;
 let low = 0, high = cues.length;
 while (low < high) { const mid = (low + high) >>> 1; if (cues[mid].start <= second) low = mid + 1; else high = mid; }
 for (let index = low - 1; index >= 0 && cues[index].end > second; index--) {
  if (cues[index].start <= second) return {cue: cues[index], index};
 }
 return null;
}
