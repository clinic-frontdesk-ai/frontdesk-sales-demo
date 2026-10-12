'use strict';

// Small deterministic parser for the free browser voice demo. It intentionally
// handles only appointment intent; the production phone agent uses Pipecat.
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.FrontdeskVoiceNLU = api;
})(typeof window !== 'undefined' ? window : globalThis, function () {
  const months = {
    january: 0, jan: 0, february: 1, feb: 1, march: 2, mar: 2,
    april: 3, apr: 3, may: 4, june: 5, jun: 5, july: 6, jul: 6,
    august: 7, aug: 7, september: 8, sep: 8, sept: 8,
    october: 9, oct: 9, november: 10, nov: 10, december: 11, dec: 11
  };
  const weekdays = {sunday:0,monday:1,tuesday:2,wednesday:3,thursday:4,friday:5,saturday:6};
  const aliases = {
    dental: [
      ['cleaning', ['cleaning','teeth cleaning','hygiene']],
      ['consultation', ['consultation','consult','tooth pain','toothache','dental advice']],
      ['new-patient', ['new patient','first appointment','exam','checkup','check-up']]
    ],
    veterinary: [
      ['vaccination', ['vaccination','vaccine','vaccines','shots','booster']],
      ['new-pet', ['new pet','first visit','new puppy','new kitten']],
      ['wellness', ['wellness','exam','checkup','check-up','annual visit']]
    ]
  };

  const iso = date => date.toISOString().slice(0,10);
  const atNoonUtc = value => new Date(`${value}T12:00:00Z`);
  const addDays = (value, count) => {
    const date = atNoonUtc(value);
    date.setUTCDate(date.getUTCDate() + count);
    return iso(date);
  };

  function parseService(text, kind, services) {
    const lower = text.toLowerCase();
    const configured = new Map((services || []).map(service => [service.id, service]));
    for (const [id, terms] of aliases[kind] || []) {
      if (configured.has(id) && terms.some(term => lower.includes(term))) return id;
    }
    for (const service of services || []) {
      const words = service.name.toLowerCase().split(/\s+/).filter(word => word.length > 3);
      if (words.some(word => lower.includes(word))) return service.id;
    }
    return null;
  }

  function parseDay(text, baseDay) {
    const lower = text.toLowerCase().replace(/[,]/g, ' ');
    if (/\bday after tomorrow\b/.test(lower)) return addDays(baseDay, 2);
    if (/\btomorrow\b/.test(lower)) return addDays(baseDay, 1);
    if (/\btoday\b/.test(lower)) return baseDay;

    const monthPattern = Object.keys(months).join('|');
    const named = lower.match(new RegExp(`\\b(${monthPattern})\\s+(\\d{1,2})(?:st|nd|rd|th)?(?:\\s+(\\d{4}))?\\b`));
    if (named) {
      const base = atNoonUtc(baseDay);
      let year = named[3] ? Number(named[3]) : base.getUTCFullYear();
      let result = new Date(Date.UTC(year, months[named[1]], Number(named[2]), 12));
      if (!named[3] && result < base) result = new Date(Date.UTC(year + 1, months[named[1]], Number(named[2]), 12));
      return iso(result);
    }

    const numeric = lower.match(/\b(\d{1,2})[\/-](\d{1,2})(?:[\/-](\d{2,4}))?\b/);
    if (numeric) {
      const base = atNoonUtc(baseDay);
      let year = numeric[3] ? Number(numeric[3]) : base.getUTCFullYear();
      if (year < 100) year += 2000;
      let result = new Date(Date.UTC(year, Number(numeric[1]) - 1, Number(numeric[2]), 12));
      if (!numeric[3] && result < base) result = new Date(Date.UTC(year + 1, Number(numeric[1]) - 1, Number(numeric[2]), 12));
      return iso(result);
    }

    for (const [name, target] of Object.entries(weekdays)) {
      if (!new RegExp(`\\b${name}\\b`).test(lower)) continue;
      const base = atNoonUtc(baseDay);
      let delta = (target - base.getUTCDay() + 7) % 7;
      if (delta === 0 || new RegExp(`\\bnext\\s+${name}\\b`).test(lower)) delta += 7;
      return addDays(baseDay, delta);
    }
    return null;
  }

  function parseTimeOfDay(text) {
    const lower = text.toLowerCase();
    if (/\bmorning\b/.test(lower)) return 'morning';
    if (/\bafternoon\b/.test(lower)) return 'afternoon';
    if (/\bevening\b/.test(lower)) return 'evening';
    return null;
  }

  function parse(text, options) {
    const clean = String(text || '').trim();
    const serviceId = parseService(clean, options.kind, options.services);
    const day = parseDay(clean, options.baseDay);
    return {
      transcript: clean,
      serviceId,
      day,
      timeOfDay: parseTimeOfDay(clean),
      complete: Boolean(serviceId && day)
    };
  }

  return {parse, parseDay, parseService};
});
